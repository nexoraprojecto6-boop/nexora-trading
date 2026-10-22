import { loadDatabaseConfig, type DatabaseConfig } from "./db/config.js";
import { ok, parseLogLevel, parseNodeEnv, parsePort, type LogLevel, type NodeEnv, type Result } from "@nexora/shared";

export interface ApiConfig {
  readonly nodeEnv: NodeEnv;
  readonly logLevel: LogLevel;
  readonly host: string;
  readonly port: number;
  /** `undefined` quando DATABASE_URL não está definida (só permitido fora de produção). */
  readonly database: DatabaseConfig | undefined;
}

export type Env = Readonly<Record<string, string | undefined>>;

/**
 * Lê e valida a configuração a partir de variáveis de ambiente.
 * Os valores recebidos nunca são repetidos nas mensagens de erro.
 */
export function loadConfig(env: Env): Result<ApiConfig> {
  const nodeEnv = parseNodeEnv(env["NODE_ENV"]);
  if (!nodeEnv.ok) return nodeEnv;
  const logLevel = parseLogLevel(env["LOG_LEVEL"]);
  if (!logLevel.ok) return logLevel;
  const port = parsePort(env["PORT"], 3000);
  if (!port.ok) return port;

  const database = loadDatabaseConfig(env, nodeEnv.value);
  if (!database.ok) return database;

  const host = env["API_HOST"]?.trim();
  return ok({
    nodeEnv: nodeEnv.value,
    logLevel: logLevel.value,
    host: host !== undefined && host !== "" ? host : "0.0.0.0",
    port: port.value,
    database: database.value,
  });
}
