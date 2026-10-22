import { fileURLToPath } from "node:url";
import { parseNodeEnv } from "@nexora/shared";
import { loadDatabaseConfig } from "./config.js";
import { runMigrations } from "./migrate.js";

/**
 * Executa as migrações pendentes. Pensado para correr como passo de release
 * (GitHub Actions ou comando de pré-deploy da plataforma), nunca no arranque da API.
 * Só imprime mensagens próprias: nunca valores de variáveis de ambiente.
 */
async function main(): Promise<number> {
  const nodeEnv = parseNodeEnv(process.env["NODE_ENV"]);
  if (!nodeEnv.ok) {
    console.error(`Configuração inválida: ${nodeEnv.error.message}`);
    return 1;
  }
  const database = loadDatabaseConfig(process.env, nodeEnv.value);
  if (!database.ok) {
    console.error(`Configuração inválida: ${database.error.message}`);
    return 1;
  }
  if (database.value === undefined) {
    console.error("Configuração inválida: DATABASE_URL em falta.");
    return 1;
  }

  const dir =
    process.env["MIGRATIONS_DIR"]?.trim() ||
    fileURLToPath(new URL("../../../../infrastructure/db/migrations/", import.meta.url));

  const result = await runMigrations(database.value, dir, (message) => console.log(message));
  if (!result.ok) {
    console.error(`Migrações falharam: ${result.error.message}`);
    return 1;
  }
  const { applied, alreadyApplied } = result.value;
  console.log(
    applied.length === 0
      ? `Nada a aplicar (${alreadyApplied} já aplicadas).`
      : `Aplicadas ${applied.length}: ${applied.join(", ")}.`,
  );
  return 0;
}

process.exit(await main());
