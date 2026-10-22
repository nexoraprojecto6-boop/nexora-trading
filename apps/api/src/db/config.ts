import { AppError, err, ok, type NodeEnv, type Result } from "@nexora/shared";

export type DatabaseSsl = "verify" | "no-verify" | "disable";

export interface DatabaseConfig {
  /** Contém credenciais. Nunca registar nem incluir em erros. */
  readonly connectionString: string;
  readonly ssl: DatabaseSsl;
}

const SSL_VALUES: readonly DatabaseSsl[] = ["verify", "no-verify", "disable"];

/** Parâmetros TLS do URL que são ignorados: o TLS é controlado só por DATABASE_SSL. */
const IGNORED_URL_PARAMS = ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl", "uselibpqcompat"];

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Lê a configuração da base de dados.
 * - Sem DATABASE_URL: devolve `undefined` (a API arranca, mas /ready indica indisponível),
 *   exceto em produção, onde é obrigatória.
 * - DATABASE_SSL: verify | no-verify | disable. Por omissão: verify em produção, disable fora dela.
 */
export function loadDatabaseConfig(env: Env, nodeEnv: NodeEnv): Result<DatabaseConfig | undefined> {
  const raw = env["DATABASE_URL"]?.trim();
  if (raw === undefined || raw === "") {
    if (nodeEnv === "production") {
      return err(new AppError("CONFIG", "Variável de ambiente obrigatória em falta: DATABASE_URL."));
    }
    return ok(undefined);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return err(new AppError("CONFIG", "DATABASE_URL inválida. Formato: postgresql://UTILIZADOR:PALAVRA_PASSE@HOST:PORTA/NOME_BD"));
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    return err(new AppError("CONFIG", "DATABASE_URL tem de começar por postgresql:// ou postgres://."));
  }
  for (const param of IGNORED_URL_PARAMS) url.searchParams.delete(param);

  const sslRaw = env["DATABASE_SSL"]?.trim().toLowerCase();
  let ssl: DatabaseSsl = nodeEnv === "production" ? "verify" : "disable";
  if (sslRaw !== undefined && sslRaw !== "") {
    const found = SSL_VALUES.find((value) => value === sslRaw);
    if (found === undefined) {
      return err(new AppError("CONFIG", `Valor inválido para DATABASE_SSL. Valores aceites: ${SSL_VALUES.join(", ")}.`));
    }
    ssl = found;
  }

  return ok({ connectionString: url.toString(), ssl });
}

/** Converte o modo configurado na opção `ssl` do driver `pg`. */
export function toPgSsl(ssl: DatabaseSsl): false | { rejectUnauthorized: boolean } {
  switch (ssl) {
    case "verify":
      return { rejectUnauthorized: true };
    case "no-verify":
      return { rejectUnauthorized: false };
    case "disable":
      return false;
  }
}
