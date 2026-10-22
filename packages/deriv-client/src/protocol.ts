import { AppError, err, ok, type Result } from "@nexora/shared";

/** Pedido enviado à Deriv. O campo `req_id` é atribuído pelo cliente. */
export type DerivRequest = Readonly<Record<string, unknown>>;

/** Mensagem recebida da Deriv. Só os campos de controlo são tipados; o resto é validado por quem consome. */
export interface DerivMessage {
  readonly msg_type?: string;
  readonly req_id?: number;
  readonly error?: Readonly<Record<string, unknown>>;
  readonly subscription?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export interface Tick {
  readonly symbol: string;
  /** Segundos desde 1970-01-01 (UTC). */
  readonly epoch: number;
  /** Preço tal como devolvido pela API. Usar `pipSize` apenas para apresentação. */
  readonly quote: number;
  readonly id?: string;
  readonly pipSize?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Converte texto bruto numa mensagem. Os erros nunca incluem o conteúdo recebido.
 */
export function parseMessage(raw: string): Result<DerivMessage> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err(new AppError("UPSTREAM", "Mensagem da Deriv não é JSON válido."));
  }
  if (!isRecord(parsed)) {
    return err(new AppError("UPSTREAM", "Mensagem da Deriv não é um objeto JSON."));
  }
  const { msg_type: msgType, req_id: reqId, error, subscription } = parsed;
  if (msgType !== undefined && typeof msgType !== "string") {
    return err(new AppError("UPSTREAM", "Campo msg_type inválido na mensagem da Deriv."));
  }
  if (reqId !== undefined && !isFiniteNumber(reqId)) {
    return err(new AppError("UPSTREAM", "Campo req_id inválido na mensagem da Deriv."));
  }
  if (error !== undefined && !isRecord(error)) {
    return err(new AppError("UPSTREAM", "Campo error inválido na mensagem da Deriv."));
  }
  if (subscription !== undefined && !isRecord(subscription)) {
    return err(new AppError("UPSTREAM", "Campo subscription inválido na mensagem da Deriv."));
  }
  return ok(parsed as DerivMessage);
}

/** Identificador da subscrição no servidor, se a mensagem tiver um. */
export function getSubscriptionId(message: DerivMessage): string | undefined {
  const id = message.subscription?.["id"];
  return typeof id === "string" && id !== "" ? id : undefined;
}

export interface DerivErrorInfo {
  readonly code: string | undefined;
  readonly message: string;
}

/** Extrai o erro devolvido pela Deriv, se existir. */
export function getErrorInfo(message: DerivMessage): DerivErrorInfo | undefined {
  const error = message.error;
  if (error === undefined) return undefined;
  const code = error["code"];
  const text = error["message"];
  return {
    code: typeof code === "string" ? code : undefined,
    message: typeof text === "string" && text !== "" ? text : "Erro devolvido pela Deriv.",
  };
}

/** Converte uma mensagem `tick` num Tick validado. */
export function parseTick(message: DerivMessage): Result<Tick> {
  const tick = message["tick"];
  if (message.msg_type !== "tick" || !isRecord(tick)) {
    return err(new AppError("UPSTREAM", "A mensagem não é um tick."));
  }
  const { symbol, epoch, quote, id, pip_size: pipSize } = tick;
  if (typeof symbol !== "string" || symbol === "" || !isFiniteNumber(epoch) || !isFiniteNumber(quote)) {
    return err(new AppError("UPSTREAM", "Tick com campos obrigatórios em falta ou inválidos."));
  }
  return ok({
    symbol,
    epoch,
    quote,
    ...(typeof id === "string" ? { id } : {}),
    ...(isFiniteNumber(pipSize) ? { pipSize } : {}),
  });
}
