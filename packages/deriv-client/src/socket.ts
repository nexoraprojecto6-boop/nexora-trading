import { AppError, err, ok, type Result } from "@nexora/shared";
import { DERIV_WS_PUBLIC_URL } from "./constants.js";
import {
  getErrorInfo,
  getSubscriptionId,
  parseMessage,
  type DerivMessage,
  type DerivRequest,
} from "./protocol.js";

const WS_OPEN = 1;
const PING_PAYLOAD = JSON.stringify({ ping: 1 });

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const NOOP_LOGGER: Logger = { debug() {}, info() {}, warn() {}, error() {} };

/** Subconjunto mínimo da interface WebSocket usado pelo cliente. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface ReconnectOptions {
  readonly enabled?: boolean;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Máximo de tentativas consecutivas. Omitido = sem limite. */
  readonly maxAttempts?: number;
}

export interface DerivSocketOptions {
  /** Por omissão, o WebSocket público. Só `wss://` é aceite. O URL nunca é registado em logs. */
  readonly url?: string;
  /** Por omissão usa o WebSocket global (Node >= 22.4 ou browser). */
  readonly webSocketFactory?: WebSocketFactory;
  readonly requestTimeoutMs?: number;
  readonly connectTimeoutMs?: number;
  readonly pingIntervalMs?: number;
  /** Sem qualquer mensagem durante este tempo, a ligação é considerada morta. */
  readonly staleAfterMs?: number;
  readonly reconnect?: ReconnectOptions;
  readonly logger?: Logger;
  readonly onStatusChange?: (status: ConnectionStatus) => void;
}

export type MessageHandler = (message: DerivMessage) => void;

export interface Subscription {
  /** Identificador local, estável mesmo após reconexões. */
  readonly id: string;
  unsubscribe(): Promise<Result<void>>;
}

interface PendingRequest {
  readonly resolve: (result: Result<DerivMessage>) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly subscriptionId: string | undefined;
}

interface SubscriptionEntry {
  readonly payload: DerivRequest;
  readonly handler: MessageHandler;
  serverId: string | undefined;
}

function defaultWebSocketFactory(): WebSocketFactory | undefined {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => unknown }).WebSocket;
  if (Ctor === undefined) return undefined;
  return (url) => new Ctor(url) as WebSocketLike;
}

/**
 * Cliente WebSocket da Deriv: uma única ligação partilhada, pedidos correlacionados
 * por `req_id`, subscrições com reencaminhamento por `subscription.id`,
 * keep-alive por `ping` e reconexão com backoff exponencial.
 *
 * Segurança: URLs (que poderão conter um OTP) e payloads nunca são registados
 * em logs nem incluídos em mensagens de erro.
 */
export class DerivSocket {
  private readonly url: string;
  private readonly factory: WebSocketFactory | undefined;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly pingIntervalMs: number;
  private readonly staleAfterMs: number;
  private readonly reconnect: Required<ReconnectOptions>;
  private readonly log: Logger;
  private readonly onStatusChange: ((status: ConnectionStatus) => void) | undefined;

  private socket: WebSocketLike | null = null;
  private currentStatus: ConnectionStatus = "idle";
  private manualClose = false;
  private connecting: Promise<Result<void>> | null = null;
  private cancelConnect: (() => void) | undefined;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private lastMessageAt = 0;

  private nextReqId = 1;
  private nextLocalId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly subscriptions = new Map<string, SubscriptionEntry>();
  private readonly serverToLocal = new Map<string, string>();
  private readonly forgetSent = new Set<string>();

  constructor(options: DerivSocketOptions = {}) {
    this.url = options.url ?? DERIV_WS_PUBLIC_URL;
    this.factory = options.webSocketFactory ?? defaultWebSocketFactory();
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
    this.pingIntervalMs = options.pingIntervalMs ?? 30_000;
    this.staleAfterMs = options.staleAfterMs ?? 90_000;
    this.reconnect = {
      enabled: options.reconnect?.enabled ?? true,
      initialDelayMs: options.reconnect?.initialDelayMs ?? 1_000,
      maxDelayMs: options.reconnect?.maxDelayMs ?? 30_000,
      maxAttempts: options.reconnect?.maxAttempts ?? Number.POSITIVE_INFINITY,
    };
    this.log = options.logger ?? NOOP_LOGGER;
    this.onStatusChange = options.onStatusChange;
  }

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  /** Abre a ligação. Se já estiver aberta ou a abrir, reutiliza-a. */
  connect(): Promise<Result<void>> {
    if (this.currentStatus === "open" && this.socket !== null) return Promise.resolve(ok(undefined));
    if (this.connecting !== null) return this.connecting;
    if (!this.url.startsWith("wss://")) {
      return Promise.resolve(err(new AppError("CONFIG", "O URL do WebSocket da Deriv tem de usar wss://.")));
    }
    this.manualClose = false;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const attempt = this.openSocket(false).then((result) => {
      this.connecting = null;
      return result;
    });
    this.connecting = attempt;
    return attempt;
  }

  /** Fecha a ligação, cancela pedidos pendentes e descarta subscrições locais. */
  close(): void {
    this.manualClose = true;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.stopKeepAlive();
    const ws = this.socket;
    this.socket = null;
    this.cancelConnect?.();
    this.rejectAllPending("Ligação encerrada localmente.");
    this.subscriptions.clear();
    this.serverToLocal.clear();
    this.forgetSent.clear();
    if (ws !== null) {
      try {
        ws.close(1000);
      } catch {
        // Ignorado: o socket já pode estar fechado.
      }
    }
    this.setStatus("closed");
  }

  /** Envia um pedido e aguarda a resposta com o mesmo `req_id`. Qualquer `req_id` no payload é substituído. */
  request(payload: DerivRequest, timeoutMs: number = this.requestTimeoutMs): Promise<Result<DerivMessage>> {
    return this.sendTracked(payload, timeoutMs, undefined);
  }

  /**
   * Cria uma subscrição (força `subscribe: 1`). O handler recebe todas as mensagens
   * da subscrição, incluindo a primeira resposta. Após uma reconexão, as subscrições
   * são repetidas automaticamente.
   */
  async subscribe(payload: DerivRequest, handler: MessageHandler): Promise<Result<Subscription>> {
    const localId = `sub-${this.nextLocalId++}`;
    const entry: SubscriptionEntry = {
      payload: { ...payload, subscribe: 1 },
      handler,
      serverId: undefined,
    };
    this.subscriptions.set(localId, entry);
    const result = await this.sendTracked(entry.payload, this.requestTimeoutMs, localId);
    if (!result.ok) {
      this.subscriptions.delete(localId);
      return err(result.error);
    }
    return ok({ id: localId, unsubscribe: () => this.unsubscribe(localId) });
  }

  private async unsubscribe(localId: string): Promise<Result<void>> {
    const entry = this.subscriptions.get(localId);
    if (entry === undefined) return ok(undefined);
    this.subscriptions.delete(localId);
    const serverId = entry.serverId;
    if (serverId === undefined) return ok(undefined);
    this.serverToLocal.delete(serverId);
    if (this.socket === null || this.socket.readyState !== WS_OPEN) return ok(undefined);
    const result = await this.sendTracked({ forget: serverId }, this.requestTimeoutMs, undefined);
    return result.ok ? ok(undefined) : err(result.error);
  }

  // ---------------------------------------------------------------------------

  private setStatus(status: ConnectionStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    try {
      this.onStatusChange?.(status);
    } catch (cause) {
      this.log.error("onStatusChange lançou uma exceção.", { cause: String(cause) });
    }
  }

  private openSocket(isReconnect: boolean): Promise<Result<void>> {
    const factory = this.factory;
    if (factory === undefined) {
      this.setStatus("closed");
      return Promise.resolve(
        err(
          new AppError(
            "CONFIG",
            "WebSocket global indisponível. Usa Node >= 22.4 ou fornece webSocketFactory.",
          ),
        ),
      );
    }
    this.setStatus(isReconnect ? "reconnecting" : "connecting");

    return new Promise<Result<void>>((resolve) => {
      let settled = false;
      let opened = false;
      let connectTimer: ReturnType<typeof setTimeout> | undefined;

      const settle = (result: Result<void>): void => {
        if (settled) return;
        settled = true;
        if (connectTimer !== undefined) clearTimeout(connectTimer);
        this.cancelConnect = undefined;
        resolve(result);
      };
      this.cancelConnect = () => settle(err(new AppError("UPSTREAM", "Ligação cancelada.")));

      let ws: WebSocketLike;
      try {
        ws = factory(this.url);
      } catch (cause) {
        this.socket = null;
        settle(err(new AppError("UPSTREAM", "Falha ao criar a ligação WebSocket.", { cause })));
        if (isReconnect) this.scheduleReconnect();
        else this.setStatus("closed");
        return;
      }
      this.socket = ws;

      connectTimer = setTimeout(() => {
        settle(err(new AppError("UPSTREAM", "Tempo esgotado a abrir a ligação à Deriv.")));
        try {
          ws.close();
        } catch {
          // Ignorado.
        }
      }, this.connectTimeoutMs);

      ws.onopen = () => {
        if (this.socket !== ws || settled) return;
        opened = true;
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.setStatus("open");
        this.startKeepAlive();
        settle(ok(undefined));
        if (isReconnect) this.resubscribeAll();
      };

      ws.onmessage = (event) => {
        if (this.socket !== ws) return;
        if (typeof event.data !== "string") {
          this.log.warn("Mensagem não textual da Deriv ignorada.");
          return;
        }
        this.handleRaw(event.data);
      };

      ws.onerror = () => {
        if (this.socket !== ws) return;
        this.log.warn("Erro na ligação WebSocket.");
      };

      ws.onclose = () => {
        if (this.socket !== ws) return;
        this.socket = null;
        this.stopKeepAlive();
        this.rejectAllPending("Ligação fechada antes da resposta.");
        settle(err(new AppError("UPSTREAM", "A ligação WebSocket foi fechada.")));
        if (this.manualClose) {
          this.setStatus("closed");
          return;
        }
        if (opened || isReconnect) this.scheduleReconnect();
        else this.setStatus("closed");
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.manualClose || !this.reconnect.enabled) {
      this.setStatus("closed");
      return;
    }
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > this.reconnect.maxAttempts) {
      this.log.error("Número máximo de tentativas de reconexão atingido.");
      this.setStatus("closed");
      return;
    }
    const base = Math.min(
      this.reconnect.maxDelayMs,
      this.reconnect.initialDelayMs * 2 ** (this.reconnectAttempts - 1),
    );
    const delay = Math.round(base + Math.random() * base * 0.25);
    this.setStatus("reconnecting");
    this.log.info("Reconexão agendada.", { attempt: this.reconnectAttempts, delayMs: delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.openSocket(true);
    }, delay);
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.pingTimer = setInterval(() => {
      const ws = this.socket;
      if (ws === null || ws.readyState !== WS_OPEN) return;
      if (Date.now() - this.lastMessageAt > this.staleAfterMs) {
        this.log.warn("Ligação sem mensagens; a reiniciar.");
        try {
          ws.close();
        } catch {
          // Ignorado.
        }
        return;
      }
      try {
        ws.send(PING_PAYLOAD);
      } catch {
        // Ignorado: o fecho da ligação trata da recuperação.
      }
    }, this.pingIntervalMs);
  }

  private stopKeepAlive(): void {
    if (this.pingTimer !== undefined) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private sendTracked(
    payload: DerivRequest,
    timeoutMs: number,
    subscriptionId: string | undefined,
  ): Promise<Result<DerivMessage>> {
    const ws = this.socket;
    if (ws === null || ws.readyState !== WS_OPEN) {
      return Promise.resolve(err(new AppError("UPSTREAM", "A ligação à Deriv não está aberta.")));
    }
    const reqId = this.nextReqId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        resolve(
          err(new AppError("UPSTREAM", "Tempo esgotado à espera de resposta da Deriv.", { details: { reqId } })),
        );
      }, timeoutMs);
      this.pending.set(reqId, { resolve, timer, subscriptionId });
      try {
        ws.send(JSON.stringify({ ...payload, req_id: reqId }));
      } catch (cause) {
        clearTimeout(timer);
        this.pending.delete(reqId);
        resolve(err(new AppError("UPSTREAM", "Falha ao enviar o pedido à Deriv.", { cause })));
      }
    });
  }

  private rejectAllPending(reason: string): void {
    for (const [reqId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve(err(new AppError("UPSTREAM", reason, { details: { reqId } })));
    }
    this.pending.clear();
  }

  private resubscribeAll(): void {
    this.serverToLocal.clear();
    for (const [localId, entry] of this.subscriptions) {
      entry.serverId = undefined;
      void this.sendTracked(entry.payload, this.requestTimeoutMs, localId).then((result) => {
        if (!result.ok) this.log.warn("Falha ao repetir uma subscrição após reconexão.", { localId });
      });
    }
  }

  private handleRaw(raw: string): void {
    this.lastMessageAt = Date.now();
    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      this.log.warn("Mensagem inválida da Deriv ignorada.");
      return;
    }
    const message = parsed.value;

    if (message.req_id !== undefined) {
      const pending = this.pending.get(message.req_id);
      if (pending !== undefined) {
        clearTimeout(pending.timer);
        this.pending.delete(message.req_id);
        this.settlePending(pending, message);
        return;
      }
    }

    const serverId = getSubscriptionId(message);
    if (serverId === undefined) return;
    const localId = this.serverToLocal.get(serverId);
    const entry = localId !== undefined ? this.subscriptions.get(localId) : undefined;
    if (entry === undefined) {
      this.forgetOrphan(serverId);
      return;
    }
    this.deliver(entry, message);
  }

  private settlePending(pending: PendingRequest, message: DerivMessage): void {
    const errorInfo = getErrorInfo(message);
    if (errorInfo !== undefined) {
      pending.resolve(
        err(
          new AppError("UPSTREAM", errorInfo.message, {
            details: {
              derivCode: errorInfo.code ?? null,
              msgType: message.msg_type ?? null,
              reqId: message.req_id ?? null,
            },
          }),
        ),
      );
      return;
    }

    if (pending.subscriptionId !== undefined) {
      const serverId = getSubscriptionId(message);
      const entry = this.subscriptions.get(pending.subscriptionId);
      if (entry === undefined) {
        // A subscrição foi cancelada localmente antes da resposta chegar.
        if (serverId !== undefined) this.forgetOrphan(serverId);
      } else {
        if (serverId !== undefined) {
          entry.serverId = serverId;
          this.serverToLocal.set(serverId, pending.subscriptionId);
        } else {
          this.log.warn("Resposta de subscrição sem subscription.id; não poderá ser cancelada no servidor.");
        }
        this.deliver(entry, message);
      }
    }
    pending.resolve(ok(message));
  }

  private deliver(entry: SubscriptionEntry, message: DerivMessage): void {
    try {
      entry.handler(message);
    } catch (cause) {
      this.log.error("O handler de subscrição lançou uma exceção.", { cause: String(cause) });
    }
  }

  /** Pede ao servidor para parar uma subscrição que o cliente já não acompanha. */
  private forgetOrphan(serverId: string): void {
    if (this.forgetSent.has(serverId)) return;
    this.forgetSent.add(serverId);
    void this.sendTracked({ forget: serverId }, this.requestTimeoutMs, undefined);
  }
}
