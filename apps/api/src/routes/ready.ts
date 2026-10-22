import type { FastifyInstance } from "fastify";
import type { Result } from "@nexora/shared";

export interface ReadinessProbe {
  ping(): Promise<Result<void>>;
}

const responseSchema = {
  type: "object",
  required: ["status", "checks"],
  additionalProperties: false,
  properties: {
    status: { type: "string" },
    checks: {
      type: "object",
      additionalProperties: false,
      properties: { database: { type: "string" } },
    },
  },
} as const;

/**
 * Prontidão: indica se a API consegue servir pedidos que dependem da base de dados.
 * Responde 503 quando a base de dados não está configurada ou não responde.
 * Nunca devolve detalhes da ligação nem mensagens de erro do driver.
 */
export function registerReadyRoutes(app: FastifyInstance, database: ReadinessProbe | undefined): void {
  app.get("/ready", { schema: { response: { 200: responseSchema, 503: responseSchema } } }, async (_request, reply) => {
    if (database === undefined) {
      return reply.status(503).send({ status: "unavailable", checks: { database: "not_configured" } });
    }
    const result = await database.ping();
    if (!result.ok) {
      return reply.status(503).send({ status: "unavailable", checks: { database: "unavailable" } });
    }
    return { status: "ok", checks: { database: "ok" } };
  });
}
