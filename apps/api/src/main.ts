import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDerivAuthClient } from "@nexora/deriv-client";
import { createAuthService } from "./auth/service.js";
import { createDatabase } from "./db/pool.js";

const configResult = loadConfig(process.env);
if (!configResult.ok) {
  // Só a mensagem: nunca imprimir valores de variáveis de ambiente.
  console.error(`Configuração inválida: ${configResult.error.message}`);
  process.exit(1);
}
const config = configResult.value;
const logPoolError = (error: Error): void => {
  // Só o nome do erro: a mensagem do driver pode conter o anfitrião da base de dados.
  app.log.error({ errorName: error.name }, "Erro na ligação à base de dados");
};
const database = config.database !== undefined ? createDatabase(config.database, logPoolError) : undefined;
const auth =
  config.auth !== undefined && database !== undefined
    ? createAuthService({ pool: database.pool, deriv: createDerivAuthClient(), config: config.auth })
    : undefined;
const app = buildApp(config, {
  ...(database !== undefined ? { database } : {}),
  ...(auth !== undefined ? { auth } : {}),
});
if (config.nodeEnv === "production" && config.database?.ssl === "disable") {
  app.log.warn("A ligação à base de dados em produção não usa TLS (DATABASE_SSL=disable).");
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "A encerrar a API");
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "Falha ao encerrar a API");
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, "Falha ao iniciar a API");
  process.exit(1);
}
