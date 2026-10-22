import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const configResult = loadConfig(process.env);
if (!configResult.ok) {
  // Só a mensagem: nunca imprimir valores de variáveis de ambiente.
  console.error(`Configuração inválida: ${configResult.error.message}`);
  process.exit(1);
}
const config = configResult.value;
const app = buildApp(config);

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
