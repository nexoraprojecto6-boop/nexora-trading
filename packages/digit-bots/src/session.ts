import { EventEmitter } from 'node:events';
import { fetchAccounts, fetchOtpUrl, pickAccount, type AuthOptions } from './auth.js';
import { DerivApiError, DerivConnectionError } from './errors.js';
import type { OpenContract, TradingSession } from './types.js';

/** Forma mínima de um WebSocket (compatível com o WebSocket global do Node 22). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: any) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface SessionOptions extends AuthOptions {
  accountType: 'demo' | 'real';
  accountId?: string;
  socketFactory?: SocketFactory;
  requestTimeoutMs?: number;
  pingIntervalMs?: number;
  maxReconnectDelayMs?: number;
  log?: (msg: string) => void;
}

interface Pending {
  expect: string;
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const OPEN = 1;

/**
 * Ligação autenticada à Deriv (REST -> OTP -> WebSocket) com req_id, ping,
 * reconexão com backoff e distribuição de `proposal_open_contract` por contrato.
 */
export class DerivSession extends EventEmitter implements TradingSession {
  currency = 'USD';
  accountId?: string;
  accountType: 'demo' | 'real';
  balance: number | null = null;

  private socket: SocketLike | null = null;
  private connecting: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private watchers = new Map<number, Set<(p: OpenContract) => void>>();
  private lastPoc = new Map<number, OpenContract>();
  private closedByUser = false;
  private pingTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private attempts = 0;

  private readonly requestTimeoutMs: number;
  private readonly pingIntervalMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly makeSocket: SocketFactory;
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: SessionOptions) {
    super();
    this.accountType = opts.accountType;
    this.accountId = opts.accountId;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 8_000;
    this.pingIntervalMs = opts.pingIntervalMs ?? 30_000;
    this.maxReconnectDelayMs = opts.maxReconnectDelayMs ?? 30_000;
    this.log = opts.log ?? (() => {});
    this.makeSocket =
      opts.socketFactory ??
      ((url) => {
        const WS = (globalThis as any).WebSocket;
        if (!WS) throw new DerivConnectionError('WebSocket global indisponível (use Node 22+)');
        return new WS(url) as SocketLike;
      });
  }

  get isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  ready(): Promise<void> {
    return this.isOpen ? Promise.resolve() : this.connect();
  }

  connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.closedByUser = false;
    this.connecting = this.doConnect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async doConnect(): Promise<void> {
    if (!this.accountId || this.balance === null) {
      const accounts = await fetchAccounts(this.opts);
      const acc = pickAccount(accounts, this.accountType, this.accountId);
      this.accountId = acc.account_id;
      this.currency = acc.currency;
      this.balance = acc.balance;
    }
    const url = await fetchOtpUrl(this.opts, this.accountId);
    await this.openSocket(url);
    this.attempts = 0;
    this.startPing();
    this.log(`Ligado à conta ${this.accountType} ${this.accountId} (${this.currency})`);
  }

  private openSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.makeSocket(url);
      this.socket = socket;
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened) {
          reject(new DerivConnectionError('Timeout ao abrir o WebSocket'));
          try {
            socket.close();
          } catch {
            /* ignore */
          }
        }
      }, 10_000);

      socket.onopen = () => {
        opened = true;
        clearTimeout(timer);
        resolve();
      };
      socket.onmessage = (ev) => this.onMessage(ev.data);
      socket.onerror = () => {
        if (!opened) {
          clearTimeout(timer);
          reject(new DerivConnectionError('Erro ao abrir o WebSocket'));
        }
      };
      socket.onclose = () => {
        clearTimeout(timer);
        if (this.socket !== socket) return;
        this.socket = null;
        this.stopPing();
        this.rejectAllPending(new DerivConnectionError('Ligação fechada'));
        if (!opened) return;
        this.emit('disconnected');
        if (!this.closedByUser) this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(this.maxReconnectDelayMs, 1000 * 2 ** this.attempts++);
    this.log(`Ligação perdida. A reconectar em ${delay} ms`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.connect();
        this.emit('reconnected');
        for (const id of this.watchers.keys()) {
          this.request({ proposal_open_contract: 1, contract_id: id, subscribe: 1 }).catch(() => {});
        }
      } catch (e) {
        this.log(`Falha ao reconectar: ${(e as Error).message}`);
        if (!this.closedByUser) this.scheduleReconnect();
      }
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.isOpen) this.request({ ping: 1 }, 5_000).catch(() => {});
    }, this.pingIntervalMs);
    this.pingTimer.unref?.();
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  private rejectAllPending(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  async request<T = any>(msg: Record<string, unknown>, timeoutMs = this.requestTimeoutMs): Promise<T> {
    if (!this.isOpen) await this.ready();
    const socket = this.socket;
    if (!socket) throw new DerivConnectionError('Sem ligação');
    const id = this.nextId++;
    const expect = Object.keys(msg)[0]!;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new DerivConnectionError(`Timeout (${timeoutMs} ms) em "${expect}"`));
      }, timeoutMs);
      this.pending.set(id, { expect, resolve, reject, timer });
      try {
        socket.send(JSON.stringify({ ...msg, req_id: id }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  watchContract(contractId: number, cb: (poc: OpenContract) => void): () => void {
    let set = this.watchers.get(contractId);
    if (!set) {
      set = new Set();
      this.watchers.set(contractId, set);
    }
    set.add(cb);
    const last = this.lastPoc.get(contractId);
    if (last) cb(last);
    return () => {
      const s = this.watchers.get(contractId);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) {
        this.watchers.delete(contractId);
        this.lastPoc.delete(contractId);
      }
    };
  }

  private onMessage(raw: unknown): void {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.msg_type === 'proposal_open_contract' && msg.proposal_open_contract && !msg.error) {
      this.dispatchPoc(msg.proposal_open_contract as OpenContract);
    }

    const reqId = msg.req_id;
    if (typeof reqId === 'number') {
      const p = this.pending.get(reqId);
      if (p && (msg.error || msg.msg_type === p.expect)) {
        clearTimeout(p.timer);
        this.pending.delete(reqId);
        if (msg.error) p.reject(new DerivApiError(msg.error.code, msg.error.message, msg.msg_type));
        else p.resolve(msg);
        return;
      }
    }
    if (msg.error) this.emit('apiError', msg.error);
  }

  private dispatchPoc(poc: OpenContract): void {
    const id = poc.contract_id;
    if (typeof id !== 'number') return;
    // Guarda sempre o último estado: se a atualização chegar antes de alguém
    // registar o watcher, ele recebe-a logo ao registar.
    this.lastPoc.set(id, poc);
    if (this.lastPoc.size > 200) {
      const oldest = this.lastPoc.keys().next().value;
      if (oldest !== undefined) this.lastPoc.delete(oldest);
    }
    this.watchers.get(id)?.forEach((cb) => cb(poc));
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.stopPing();
    this.rejectAllPending(new DerivConnectionError('Sessão encerrada'));
    const s = this.socket;
    this.socket = null;
    try {
      s?.close();
    } catch {
      /* ignore */
    }
  }
}
