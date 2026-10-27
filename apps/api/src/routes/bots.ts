import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { RISK_PARAMS } from "@nexora/bot-engine";
import { cookieNames, parseCookies } from "../auth/cookies.js";
import type { AuthConfig } from "../auth/config.js";
import type { AuthService, SessionUser } from "../auth/service.js";
import type { BotService } from "../bots/service.js";

export interface BotRouteDeps {
  readonly auth: AuthService | undefined;
  readonly authConfig: AuthConfig | undefined;
  readonly bots: BotService | undefined;
}

const botIdParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", pattern: "^[a-z0-9-]{1,40}$" } },
} as const;

const selectionBody = {
  type: "object",
  required: ["botId"],
  additionalProperties: false,
  properties: { botId: { type: "string", minLength: 1, maxLength: 40 } },
} as const;

const configBody = {
  type: "object",
  required: ["botId", "risk"],
  additionalProperties: false,
  properties: {
    botId: { type: "string", minLength: 1, maxLength: 40 },
    params: { type: "object" },
    risk: { type: "object" },
  },
} as const;

export function registerBotRoutes(app: FastifyInstance, deps: BotRouteDeps): void {
  const { auth, authConfig, bots } = deps;

  /** Devolve o utilizador autenticado ou responde ao pedido (401/503) e devolve undefined. */
  async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | undefined> {
    if (auth === undefined || authConfig === undefined || bots === undefined) {
      await reply.status(503).send({ error: { code: "CONFIG", message: "Funcionalidade não configurada neste ambiente." } });
      return undefined;
    }
    const token = parseCookies(request.headers.cookie)[cookieNames(authConfig.cookieSecure).session];
    const session = token === undefined ? undefined : await auth.getSession(token);
    if (session !== undefined && !session.ok) throw session.error;
    if (session === undefined || session.value === null) {
      await reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Sessão inexistente ou expirada." } });
      return undefined;
    }
    return session.value;
  }

  /** Proteção CSRF dos pedidos que alteram dados: só aceita a origem do frontend. */
  async function requireWebOrigin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (authConfig === undefined || request.headers.origin !== authConfig.webOrigin) {
      await reply.status(403).send({ error: { code: "FORBIDDEN", message: "Origem não autorizada." } });
      return false;
    }
    return true;
  }

  app.get("/bots", async (request, reply) => {
    if ((await requireUser(request, reply)) === undefined) return reply;
    // Lista completa (nomes, descrições e parâmetros): o catálogo é pequeno e estático.
    return { bots: bots?.list() ?? [], riskParams: RISK_PARAMS };
  });

  app.get<{ Params: { id: string } }>("/bots/:id", { schema: { params: botIdParams } }, async (request, reply) => {
    if ((await requireUser(request, reply)) === undefined) return reply;
    const bot = bots?.get(request.params.id);
    if (bot === undefined) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Bot não encontrado." } });
    return { bot, riskParams: RISK_PARAMS };
  });

  app.get("/me/bot", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (user === undefined || bots === undefined) return reply;
    const state = await bots.getUserState(user.userId);
    if (!state.ok) throw state.error;
    return state.value;
  });

  app.put<{ Body: { botId: string } }>("/me/bot/selection", { schema: { body: selectionBody } }, async (request, reply) => {
    if (!(await requireWebOrigin(request, reply))) return reply;
    const user = await requireUser(request, reply);
    if (user === undefined || bots === undefined) return reply;
    const result = await bots.select(user.userId, request.body.botId);
    if (!result.ok) throw result.error;
    return reply.status(204).send();
  });

  app.put<{ Body: { botId: string; params?: unknown; risk: unknown } }>(
    "/me/bot/config",
    { schema: { body: configBody } },
    async (request, reply) => {
      if (!(await requireWebOrigin(request, reply))) return reply;
      const user = await requireUser(request, reply);
      if (user === undefined || bots === undefined) return reply;
      const { botId, params, risk } = request.body;
      const result = await bots.saveConfig(user.userId, botId, { params: params ?? {}, risk });
      if (!result.ok) throw result.error;
      return { config: result.value };
    },
  );
}
