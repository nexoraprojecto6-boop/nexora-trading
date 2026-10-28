import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { RISK_PARAMS } from "@nexora/bot-engine";
import { cookieNames, parseCookies } from "../auth/cookies.js";
import type { AuthConfig } from "../auth/config.js";
import type { AuthService, SessionUser } from "../auth/service.js";
import type { BotService } from "../bots/service.js";
import type { BotRunner } from "../bots/runner.js";
import { AppError } from "@nexora/shared";

export interface BotRouteDeps {
  readonly auth: AuthService | undefined;
  readonly authConfig: AuthConfig | undefined;
  readonly bots: BotService | undefined;
  readonly runner?: BotRunner | undefined;
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

const accountBody = {
  type: "object",
  required: ["accountId"],
  additionalProperties: false,
  properties: { accountId: { type: "string", minLength: 1, maxLength: 40 } },
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
  const { auth, authConfig, bots, runner } = deps;

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

  // ── Execução dos bots (por utilizador) ──────────────────────────────────

  /** Utilizador + serviços necessários para operar; responde 503 se o servidor não estiver preparado. */
  async function requireRunner(request: FastifyRequest, reply: FastifyReply) {
    const user = await requireUser(request, reply);
    if (user === undefined) return undefined;
    if (auth === undefined || bots === undefined || runner === undefined) {
      await reply.status(503).send({ error: { code: "CONFIG", message: "Execução de bots não configurada neste ambiente." } });
      return undefined;
    }
    return { user, auth, bots, runner };
  }

  /** Conta do utilizador (nunca de outro) e o respetivo token Deriv. */
  async function resolveAccount(ctx: NonNullable<Awaited<ReturnType<typeof requireRunner>>>, accountId: string) {
    const account = ctx.user.accounts.find((a) => a.accountId === accountId && a.status === "active");
    if (account === undefined) throw new AppError("NOT_FOUND", "Conta não encontrada.");
    const token = await ctx.auth.getDerivAccessToken(ctx.user.userId);
    if (!token.ok) throw token.error;
    if (token.value === null) throw new AppError("FORBIDDEN", "Ligação à Deriv expirada. Termine a sessão e entre de novo.");
    return { account: { accountId: account.accountId, accountType: account.accountType }, token: token.value };
  }

  app.get("/me/bots/live", async (request, reply) => {
    const ctx = await requireRunner(request, reply);
    if (ctx === undefined) return reply;
    return ctx.runner.state(ctx.user.userId);
  });

  app.post<{ Body: { accountId: string } }>("/me/bots/warmup", { schema: { body: accountBody } }, async (request, reply) => {
    if (!(await requireWebOrigin(request, reply))) return reply;
    const ctx = await requireRunner(request, reply);
    if (ctx === undefined) return reply;
    const { account, token } = await resolveAccount(ctx, request.body.accountId);
    const result = await ctx.runner.warmUp({ userId: ctx.user.userId, token, account });
    if (!result.ok) throw result.error;
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string }; Body: { accountId: string } }>(
    "/me/bots/:id/start",
    { schema: { params: botIdParams, body: accountBody } },
    async (request, reply) => {
      if (!(await requireWebOrigin(request, reply))) return reply;
      const ctx = await requireRunner(request, reply);
      if (ctx === undefined) return reply;
      const botId = request.params.id;
      if (!ctx.runner.isRunnable(botId)) throw new AppError("VALIDATION", "Este bot não abre operações.");

      const state = await ctx.bots.getUserState(ctx.user.userId);
      if (!state.ok) throw state.error;
      const { selectedBotId, config } = state.value;
      if (selectedBotId !== botId || config === null) {
        throw new AppError("VALIDATION", "Guarde as configurações deste bot antes de iniciar.");
      }

      const { account, token } = await resolveAccount(ctx, request.body.accountId);
      const risk = config.risk;
      const result = await ctx.runner.start({
        userId: ctx.user.userId,
        token,
        account,
        botId,
        overrides: {
          symbol: String(config.params["symbol"] ?? "R_100"),
          stake: Number(risk["stake"]),
          takeProfit: Number(risk["takeProfit"]),
          stopLoss: Number(risk["stopLoss"]),
          maxConsecutiveLosses: 0,
          maxTrades: 0,
          cooldownMs: 0,
          stakeMultiplierOnLoss: 1,
        },
      });
      if (!result.ok) throw result.error;
      return reply.status(204).send();
    },
  );

  app.post("/me/bots/clear-history", async (request, reply) => {
    if (!(await requireWebOrigin(request, reply))) return reply;
    const ctx = await requireRunner(request, reply);
    if (ctx === undefined) return reply;
    ctx.runner.clearHistory(ctx.user.userId);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/me/bots/:id/stop", { schema: { params: botIdParams } }, async (request, reply) => {
    if (!(await requireWebOrigin(request, reply))) return reply;
    const ctx = await requireRunner(request, reply);
    if (ctx === undefined) return reply;
    await ctx.runner.stop(ctx.user.userId, request.params.id);
    return reply.status(204).send();
  });
}
