import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { clearCookie, cookieNames, parseCookies, serializeCookie } from "../auth/cookies.js";
import type { AuthConfig } from "../auth/config.js";
import type { AuthService } from "../auth/service.js";

export interface AuthRouteDeps {
  readonly service: AuthService | undefined;
  readonly config: AuthConfig | undefined;
}

const loginQuerySchema = {
  type: "object",
  additionalProperties: true,
  properties: { prompt: { type: "string", enum: ["registration"] } },
} as const;

const callbackQuerySchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    code: { type: "string", maxLength: 2000 },
    state: { type: "string", maxLength: 200 },
    error: { type: "string", maxLength: 200 },
    error_description: { type: "string", maxLength: 1000 },
  },
} as const;

function notConfigured(reply: FastifyReply): FastifyReply {
  return reply.status(503).send({ error: { code: "CONFIG", message: "Autenticação não configurada neste ambiente." } });
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { service, config } = deps;

  function sessionTokenOf(request: FastifyRequest, auth: AuthConfig): string | undefined {
    return parseCookies(request.headers.cookie)[cookieNames(auth.cookieSecure).session];
  }

  app.get<{ Querystring: { prompt?: "registration" } }>("/auth/login", { schema: { querystring: loginQuerySchema } }, async (request, reply) => {
    if (service === undefined || config === undefined) return notConfigured(reply);
    const started = await service.startLogin({ registration: request.query.prompt === "registration" });
    if (!started.ok) throw started.error;
    const names = cookieNames(config.cookieSecure);
    // O cookie liga esta tentativa de login a este browser (defesa contra login CSRF).
    reply.header(
      "Set-Cookie",
      serializeCookie(names.oauth, started.value.browserNonce, { maxAgeSeconds: config.loginAttemptTtlSeconds, secure: config.cookieSecure }),
    );
    return reply.redirect(started.value.redirectUrl, 302);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/callback",
    { schema: { querystring: callbackQuerySchema } },
    async (request, reply) => {
      if (service === undefined || config === undefined) return notConfigured(reply);
      const names = cookieNames(config.cookieSecure);
      const cookies = parseCookies(request.headers.cookie);
      // O frontend (página /callback) mostra o resultado. Nunca se repete texto vindo do pedido.
      const failure = `${config.webOrigin}/callback?error=login_failed`;
      const denied = `${config.webOrigin}/callback?error=access_denied`;
      const clearOauth = clearCookie(names.oauth, config.cookieSecure);

      const { code, state, error } = request.query;
      if (error !== undefined || code === undefined || state === undefined) {
        reply.header("Set-Cookie", clearOauth);
        return reply.redirect(error === "access_denied" ? denied : failure, 302);
      }

      const completed = await service.completeLogin({ code, state, browserNonce: cookies[names.oauth] ?? "" });
      if (!completed.ok) {
        request.log.warn({ code: completed.error.code }, "Login recusado");
        reply.header("Set-Cookie", clearOauth);
        return reply.redirect(failure, 302);
      }
      reply.header("Set-Cookie", [
        serializeCookie(names.session, completed.value.sessionToken, { maxAgeSeconds: config.sessionTtlSeconds, secure: config.cookieSecure }),
        clearOauth,
      ]);
      return reply.redirect(`${config.webOrigin}/callback`, 302);
    },
  );

  app.get("/me", async (request, reply) => {
    if (service === undefined || config === undefined) return notConfigured(reply);
    const token = sessionTokenOf(request, config);
    const session = token === undefined ? undefined : await service.getSession(token);
    if (session !== undefined && !session.ok) throw session.error;
    if (session === undefined || session.value === null) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Sessão inexistente ou expirada." } });
    }
    return { user: { id: session.value.userId, accounts: session.value.accounts } };
  });

  app.get("/me/accounts", async (request, reply) => {
    if (service === undefined || config === undefined) return notConfigured(reply);
    const token = sessionTokenOf(request, config);
    const session = token === undefined ? undefined : await service.getSession(token);
    if (session !== undefined && !session.ok) throw session.error;
    if (session === undefined || session.value === null) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Sessão inexistente ou expirada." } });
    }
    const view = await service.getAccountsView(session.value.userId);
    if (!view.ok) throw view.error;
    return {
      live: view.value.live,
      accounts: view.value.accounts.map((account) => ({
        accountId: account.accountId,
        accountType: account.accountType,
        currency: account.currency,
        status: account.status,
        balance: account.balance ?? null,
      })),
    };
  });

  app.get("/online-count", async (request, reply) => {
    if (service === undefined || config === undefined) return notConfigured(reply);
    const token = sessionTokenOf(request, config);
    const session = token === undefined ? undefined : await service.getSession(token);
    if (session !== undefined && !session.ok) throw session.error;
    if (session === undefined || session.value === null) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Sessão inexistente ou expirada." } });
    }
    const count = await service.countOnline();
    if (!count.ok) throw count.error;
    return { count: count.value };
  });

  app.post("/auth/logout", async (request, reply) => {
    if (service === undefined || config === undefined) return notConfigured(reply);
    // Proteção CSRF: só aceita pedidos originados no frontend configurado.
    if (request.headers.origin !== config.webOrigin) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Origem não autorizada." } });
    }
    const token = sessionTokenOf(request, config);
    if (token !== undefined) {
      const result = await service.logout(token);
      if (!result.ok) throw result.error;
    }
    reply.header("Set-Cookie", clearCookie(cookieNames(config.cookieSecure).session, config.cookieSecure));
    return reply.status(204).send();
  });
}
