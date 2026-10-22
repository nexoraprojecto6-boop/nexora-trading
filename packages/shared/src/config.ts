import { AppError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

export const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === "";
}

function parseOneOf<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): Result<T> {
  if (isBlank(value)) return ok(fallback);
  const normalized = value.trim().toLowerCase();
  const found = allowed.find((item) => item === normalized);
  if (found !== undefined) return ok(found);
  // O valor recebido não é repetido na mensagem, por precaução.
  return err(
    new AppError("CONFIG", `Valor inválido para ${name}. Valores aceites: ${allowed.join(", ")}.`),
  );
}

export function parseNodeEnv(
  value: string | undefined,
  fallback: NodeEnv = "development",
): Result<NodeEnv> {
  return parseOneOf("NODE_ENV", value, NODE_ENVS, fallback);
}

export function parseLogLevel(
  value: string | undefined,
  fallback: LogLevel = "info",
): Result<LogLevel> {
  return parseOneOf("LOG_LEVEL", value, LOG_LEVELS, fallback);
}

export function parsePort(value: string | undefined, fallback: number): Result<number> {
  if (isBlank(value)) return ok(fallback);
  const trimmed = value.trim();
  const port = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return err(new AppError("CONFIG", "Valor inválido para PORT. Esperado: inteiro entre 1 e 65535."));
  }
  return ok(port);
}

/** Exige que uma variável obrigatória exista e não esteja vazia. */
export function requireEnv(name: string, value: string | undefined): Result<string> {
  if (isBlank(value)) {
    return err(new AppError("CONFIG", `Variável de ambiente obrigatória em falta: ${name}.`));
  }
  return ok(value.trim());
}
