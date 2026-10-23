import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { isAppError } from "@nexora/shared";
import type { ApiConfig } from "./config.js";
import { HTTP_STATUS_BY_CODE, codeForClientStatus } from "./http-errors.js";
import type { AuthService } from "./auth/service.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerReadyRoutes, type ReadinessProbe } from "./routes/ready.js";

export interface AppDependencies {
  /** Base de dados (ou equivalente em testes). É fechada quando a app fecha. */
  readonly database?: ReadinessProbe & { close(): Promise<void> };
  /** Serviço de autenticação. Sem ele, as rotas /auth/* e /me respondem 503. */
  readonly auth?: AuthService;
}

export async function buildApp(config: ApiConfig, deps: AppDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Nunca registar credenciais que cheguem em cabeçalhos.
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
    },
    bodyLimit: 1_048_576,
  });

  // CORS: só a origem do frontend, com cookies. Sem autenticação configurada não há CORS (nenhuma origem é autorizada).
  if (config.auth !== undefined) {
    await app.register(cors, {
      origin: config.auth.webOrigin,
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    });
  }

  // Cabeçalhos de segurança básicos para uma API JSON.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Cache-Control", "no-store");
    reply.header("Referrer-Policy", "no-referrer");
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({ error: { code: "NOT_FOUND", message: "Recurso não encontrado." } });
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (isAppError(error)) {
      const status = HTTP_STATUS_BY_CODE[error.code];
      if (status >= 500) {
        request.log.error({ err: error, code: error.code }, "Erro interno da aplicação");
        void reply.status(status).send({ error: { code: error.code, message: "Erro interno do servidor." } });
        return;
      }
      request.log.warn({ code: error.code }, "Pedido recusado");
      void reply.status(status).send({ error: error.toJSON() });
      return;
    }

    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      const message = error instanceof Error ? error.message : "Pedido inválido.";
      void reply.status(statusCode).send({ error: { code: codeForClientStatus(statusCode), message } });
      return;
    }

    request.log.error({ err: error }, "Erro não tratado");
    void reply.status(500).send({ error: { code: "INTERNAL", message: "Erro interno do servidor." } });
  });

  registerHealthRoutes(app);
  registerReadyRoutes(app, deps.database);
  registerAuthRoutes(app, { service: deps.auth, config: config.auth });
  const database = deps.database;
  if (database !== undefined) app.addHook("onClose", async () => database.close());
  return app;
}
