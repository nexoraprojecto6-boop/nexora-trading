import type { FastifyInstance } from "fastify";

const SERVICE_NAME = "nexora-api";

/**
 * Verificação de vida do processo. Não toca em base de dados nem em serviços externos,
 * para que um problema a jusante não faça a plataforma reiniciar a API sem necessidade.
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["status", "service", "uptimeSeconds"],
            additionalProperties: false,
            properties: {
              status: { type: "string" },
              service: { type: "string" },
              uptimeSeconds: { type: "integer" },
            },
          },
        },
      },
    },
    async () => ({
      status: "ok",
      service: SERVICE_NAME,
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );
}
