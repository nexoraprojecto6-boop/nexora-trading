import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { AppError, err, ok, type Result } from "@nexora/shared";
import { toPgSsl, type DatabaseConfig } from "./config.js";

/** Formato obrigatório: 4 dígitos, sublinhado, nome em minúsculas. Ex.: 0001_criar_tabela.sql */
export const MIGRATION_FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Chave do advisory lock que impede duas execuções simultâneas de migrações. */
const MIGRATION_LOCK_KEY = 727274;

export interface MigrationFile {
  /** Nome do ficheiro sem a extensão. */
  readonly version: string;
  readonly sql: string;
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly version: string;
  readonly checksum: string;
}

export function checksumOf(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

/**
 * Decide que migrações falta aplicar. Falha se:
 * - houver duas migrações com o mesmo número;
 * - uma migração já aplicada tiver desaparecido ou sido alterada;
 * - uma migração nova tiver número anterior a uma já aplicada.
 */
export function planMigrations(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
): Result<readonly MigrationFile[]> {
  const sorted = [...files].sort((a, b) => a.version.localeCompare(b.version));

  const seen = new Set<string>();
  for (const file of sorted) {
    const number = file.version.slice(0, 4);
    if (seen.has(number)) {
      return err(new AppError("CONFIG", `Número de migração duplicado: ${number}.`));
    }
    seen.add(number);
  }

  const byVersion = new Map(sorted.map((file) => [file.version, file]));
  for (const done of applied) {
    const file = byVersion.get(done.version);
    if (file === undefined) {
      return err(new AppError("CONFIG", `A migração já aplicada ${done.version} não existe no código.`));
    }
    if (file.checksum !== done.checksum) {
      return err(
        new AppError("CONFIG", `A migração ${done.version} foi alterada depois de aplicada. Cria uma migração nova em vez de a editar.`),
      );
    }
  }

  const appliedVersions = new Set(applied.map((item) => item.version));
  const lastApplied = [...appliedVersions].sort().at(-1);
  const pending = sorted.filter((file) => !appliedVersions.has(file.version));
  if (lastApplied !== undefined) {
    const outOfOrder = pending.find((file) => file.version < lastApplied);
    if (outOfOrder !== undefined) {
      return err(new AppError("CONFIG", `A migração ${outOfOrder.version} tem número anterior a uma já aplicada.`));
    }
  }
  return ok(pending);
}

export async function loadMigrationFiles(dir: string): Promise<Result<MigrationFile[]>> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (cause) {
    return err(new AppError("CONFIG", "Não foi possível ler a pasta de migrações.", { cause }));
  }
  const files: MigrationFile[] = [];
  for (const name of names.filter((item) => item.endsWith(".sql")).sort()) {
    if (!MIGRATION_FILE_PATTERN.test(name)) {
      return err(new AppError("CONFIG", `Nome de migração inválido: ${name}. Formato: 0001_nome_em_minusculas.sql`));
    }
    try {
      const sql = await readFile(join(dir, name), "utf8");
      files.push({ version: name.slice(0, -4), sql, checksum: checksumOf(sql) });
    } catch (cause) {
      return err(new AppError("CONFIG", `Não foi possível ler a migração ${name}.`, { cause }));
    }
  }
  return ok(files);
}

export interface MigrationReport {
  readonly applied: readonly string[];
  readonly alreadyApplied: number;
}

/**
 * Aplica as migrações pendentes, cada uma na sua própria transação.
 * Usa um advisory lock para que várias instâncias não migrem ao mesmo tempo.
 */
export async function runMigrations(
  config: DatabaseConfig,
  dir: string,
  log: (message: string) => void = () => {},
): Promise<Result<MigrationReport>> {
  const loaded = await loadMigrationFiles(dir);
  if (!loaded.ok) return loaded;

  const client = new pg.Client({
    connectionString: config.connectionString,
    ssl: toPgSsl(config.ssl),
    connectionTimeoutMillis: 10_000,
    application_name: "nexora-migrate",
  });
  client.on("error", () => {
    // Evita que um erro de ligação derrube o processo; o erro chega pelas queries.
  });

  try {
    await client.connect();
  } catch (cause) {
    return err(new AppError("UPSTREAM", "Não foi possível ligar à base de dados.", { cause }));
  }

  let locked = false;
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    locked = true;
    await client.query(
      `create table if not exists schema_migrations (
         version    text primary key,
         checksum   text not null,
         applied_at timestamptz not null default now()
       )`,
    );
    const rows = await client.query<AppliedMigration>("select version, checksum from schema_migrations order by version");
    const plan = planMigrations(loaded.value, rows.rows);
    if (!plan.ok) return plan;

    const applied: string[] = [];
    for (const migration of plan.value) {
      log(`A aplicar ${migration.version}...`);
      try {
        await client.query("begin");
        await client.query(migration.sql);
        await client.query("insert into schema_migrations (version, checksum) values ($1, $2)", [
          migration.version,
          migration.checksum,
        ]);
        await client.query("commit");
      } catch (cause) {
        await client.query("rollback").catch(() => undefined);
        const pgCode = (cause as { code?: unknown }).code;
        return err(
          new AppError("INTERNAL", `Falha ao aplicar a migração ${migration.version}. Alterações revertidas.`, {
            cause,
            details: { pgCode: typeof pgCode === "string" ? pgCode : null },
          }),
        );
      }
      applied.push(migration.version);
    }
    return ok({ applied, alreadyApplied: rows.rows.length });
  } catch (cause) {
    return err(new AppError("UPSTREAM", "Erro ao executar migrações na base de dados.", { cause }));
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
