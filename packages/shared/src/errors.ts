/**
 * Códigos de erro estáveis da aplicação.
 * Servem para tratamento programático (API, worker, frontend),
 * independentemente do texto da mensagem.
 */
export const ERROR_CODES = [
  "VALIDATION",
  "CONFIG",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppErrorOptions {
  /** Erro original que provocou este. Nunca é incluído em toJSON(). */
  readonly cause?: unknown;
  /** Contexto adicional. NÃO colocar segredos, tokens ou dados pessoais. */
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface SerializedAppError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.details = options.details;
  }

  /** Forma segura para enviar ao cliente: sem stack e sem causa. */
  toJSON(): SerializedAppError {
    return this.details !== undefined
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
