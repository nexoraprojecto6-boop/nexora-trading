import pg from "pg";
import { AppError, err, ok, type Result } from "@nexora/shared";
import { toPgSsl, type DatabaseConfig } from "./config.js";

export interface Database {
  readonly pool: pg.Pool;
  /** Verifica se a base de dados responde. Nunca expõe detalhes da ligação. */
  ping(): Promise<Result<void>>;
  close(): Promise<void>;
}

const POOL_MAX = 10;

export function createDatabase(config: DatabaseConfig, onPoolError: (error: Error) => void): Database {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    ssl: toPgSsl(config.ssl),
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    application_name: "nexora-api",
  });
  // Sem este handler, um erro numa ligação ociosa derrubaria o processo.
  pool.on("error", onPoolError);

  return {
    pool,
    async ping() {
      try {
        await pool.query("select 1");
        return ok(undefined);
      } catch (cause) {
        return err(new AppError("UPSTREAM", "Base de dados indisponível.", { cause }));
      }
    },
    close: () => pool.end(),
  };
}
