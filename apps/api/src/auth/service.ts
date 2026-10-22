import type pg from "pg";
import { buildAuthorizeUrl, type DerivAccount, type DerivAuthClient } from "@nexora/deriv-client";
import { AppError, err, ok, type Result } from "@nexora/shared";
import type { AuthConfig } from "./config.js";
import { createPkce, decryptSecret, encryptSecret, randomToken, safeEqualHex, sha256Hex } from "./crypto.js";

export interface SessionUser {
  readonly userId: string;
  readonly accounts: readonly DerivAccount[];
}

export interface AuthService {
  /** Prepara o login: devolve o URL da Deriv e o nonce a guardar no cookie do browser. */
  startLogin(): Promise<Result<{ redirectUrl: string; browserNonce: string }>>;
  /** Conclui o login. Os erros para o utilizador são sempre genéricos. */
  completeLogin(input: { code: string; state: string; browserNonce: string }): Promise<Result<{ sessionToken: string }>>;
  /** `ok(null)` quando o token não existe ou expirou. */
  getSession(token: string): Promise<Result<SessionUser | null>>;
  logout(token: string): Promise<Result<void>>;
}

export interface AuthServiceDeps {
  readonly pool: pg.Pool;
  readonly deriv: DerivAuthClient;
  readonly config: AuthConfig;
}

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOGIN_FAILED = "Pedido de login inválido ou expirado.";
const DB_FAILED = "Erro ao aceder à base de dados.";

async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function createAuthService({ pool, deriv, config }: AuthServiceDeps): AuthService {
  const key = config.encryptionKey;

  async function loadAccounts(userId: string): Promise<DerivAccount[]> {
    const rows = await pool.query<{ account_id: string; account_type: "demo" | "real"; currency: string; status: "active" | "inactive" }>(
      "select account_id, account_type, currency, status from deriv_accounts where user_id = $1 order by account_type, account_id",
      [userId],
    );
    return rows.rows.map((row) => ({
      accountId: row.account_id,
      accountType: row.account_type,
      currency: row.currency,
      status: row.status,
    }));
  }

  return {
    async startLogin() {
      try {
        // Limpeza oportunista de tentativas expiradas.
        await pool.query("delete from oauth_login_attempts where expires_at < now()");
        const state = randomToken(32);
        const browserNonce = randomToken(32);
        const pkce = createPkce();
        await pool.query(
          `insert into oauth_login_attempts (state_hash, browser_hash, code_verifier_enc, expires_at)
           values ($1, $2, $3, now() + make_interval(secs => $4))`,
          [sha256Hex(state), sha256Hex(browserNonce), encryptSecret(key, pkce.verifier, "oauth_verifier"), config.loginAttemptTtlSeconds],
        );
        const redirectUrl = buildAuthorizeUrl({
          clientId: config.appId,
          redirectUri: config.redirectUri,
          scopes: ["trade"],
          state,
          codeChallenge: pkce.challenge,
        });
        return ok({ redirectUrl, browserNonce });
      } catch (cause) {
        return err(new AppError("INTERNAL", DB_FAILED, { cause }));
      }
    },

    async completeLogin({ code, state, browserNonce }) {
      if (code.length === 0 || code.length > 2000 || state.length === 0 || state.length > 200 || browserNonce.length === 0 || browserNonce.length > 200) {
        return err(new AppError("VALIDATION", LOGIN_FAILED));
      }

      // 1. Consumir a tentativa (uso único), mesmo que o resto falhe.
      let verifierEnc: string;
      try {
        const consumed = await pool.query<{ browser_hash: string; code_verifier_enc: string; expired: boolean }>(
          "delete from oauth_login_attempts where state_hash = $1 returning browser_hash, code_verifier_enc, (expires_at < now()) as expired",
          [sha256Hex(state)],
        );
        const row = consumed.rows[0];
        // Mesma resposta para state desconhecido, expirado ou de outro browser.
        if (row === undefined || row.expired || !safeEqualHex(row.browser_hash, sha256Hex(browserNonce))) {
          return err(new AppError("VALIDATION", LOGIN_FAILED));
        }
        verifierEnc = row.code_verifier_enc;
      } catch (cause) {
        return err(new AppError("INTERNAL", DB_FAILED, { cause }));
      }

      const verifier = decryptSecret(key, verifierEnc, "oauth_verifier");
      if (!verifier.ok) return err(new AppError("INTERNAL", "Erro interno de autenticação.", { cause: verifier.error }));

      // 2. Trocar o código (no backend) e obter as contas.
      const token = await deriv.exchangeCode({
        clientId: config.appId,
        code,
        redirectUri: config.redirectUri,
        codeVerifier: verifier.value,
      });
      if (!token.ok) return token;
      const accounts = await deriv.listAccounts(token.value.accessToken);
      if (!accounts.ok) return accounts;
      if (accounts.value.length === 0) {
        return err(new AppError("FORBIDDEN", "A conta Deriv não tem contas de trading disponíveis."));
      }

      // 3. Criar/identificar o utilizador, guardar credenciais cifradas e abrir sessão.
      try {
        const sessionToken = randomToken(32);
        await withTransaction(pool, async (client) => {
          const accountIds = accounts.value.map((account) => account.accountId);
          const lockKey = [...accountIds].sort()[0] ?? "";
          // Serializa logins simultâneos da mesma conta (evita utilizadores duplicados).
          await client.query("select pg_advisory_xact_lock(hashtext($1))", [lockKey]);

          const existing = await client.query<{ user_id: string }>(
            `select da.user_id from deriv_accounts da join users u on u.id = da.user_id
             where da.account_id = any($1::text[]) order by u.created_at, u.id limit 1`,
            [accountIds],
          );
          let userId = existing.rows[0]?.user_id;
          if (userId === undefined) {
            const created = await client.query<{ id: string }>("insert into users default values returning id");
            userId = created.rows[0]?.id;
            if (userId === undefined) throw new Error("Falha ao criar utilizador.");
          }

          for (const account of accounts.value) {
            // Nunca reatribui uma conta já ligada a outro utilizador.
            await client.query(
              `insert into deriv_accounts (account_id, user_id, account_type, currency, status)
               values ($1, $2, $3, $4, $5)
               on conflict (account_id) do update
                 set account_type = excluded.account_type, currency = excluded.currency, status = excluded.status`,
              [account.accountId, userId, account.accountType, account.currency, account.status],
            );
          }

          const context = `deriv_token:${userId}`;
          await client.query(
            `insert into deriv_credentials (user_id, access_token_enc, access_expires_at, refresh_token_enc, scope)
             values ($1, $2, case when $3::int is null then null else now() + make_interval(secs => $3::int) end, $4, $5)
             on conflict (user_id) do update
               set access_token_enc = excluded.access_token_enc, access_expires_at = excluded.access_expires_at,
                   refresh_token_enc = excluded.refresh_token_enc, scope = excluded.scope`,
            [
              userId,
              encryptSecret(key, token.value.accessToken, context),
              token.value.expiresInSeconds ?? null,
              token.value.refreshToken !== undefined ? encryptSecret(key, token.value.refreshToken, context) : null,
              token.value.scope ?? null,
            ],
          );

          await client.query("update users set last_login_at = now() where id = $1", [userId]);
          await client.query("delete from sessions where user_id = $1 and expires_at < now()", [userId]);
          await client.query(
            "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(secs => $3))",
            [sha256Hex(sessionToken), userId, config.sessionTtlSeconds],
          );
        });
        return ok({ sessionToken });
      } catch (cause) {
        return err(new AppError("INTERNAL", DB_FAILED, { cause }));
      }
    },

    async getSession(token) {
      if (!SESSION_TOKEN_PATTERN.test(token)) return ok(null);
      try {
        const found = await pool.query<{ user_id: string }>(
          `update sessions
              set last_seen_at = case when last_seen_at < now() - interval '1 minute' then now() else last_seen_at end
            where token_hash = $1 and expires_at > now()
        returning user_id`,
          [sha256Hex(token)],
        );
        const userId = found.rows[0]?.user_id;
        if (userId === undefined) return ok(null);
        return ok({ userId, accounts: await loadAccounts(userId) });
      } catch (cause) {
        return err(new AppError("INTERNAL", DB_FAILED, { cause }));
      }
    },

    async logout(token) {
      if (!SESSION_TOKEN_PATTERN.test(token)) return ok(undefined);
      try {
        await withTransaction(pool, async (client) => {
          const removed = await client.query<{ user_id: string }>("delete from sessions where token_hash = $1 returning user_id", [sha256Hex(token)]);
          const userId = removed.rows[0]?.user_id;
          // Decisão desta fase: terminar sessão remove também as credenciais Deriv guardadas.
          if (userId !== undefined) await client.query("delete from deriv_credentials where user_id = $1", [userId]);
        });
        return ok(undefined);
      } catch (cause) {
        return err(new AppError("INTERNAL", DB_FAILED, { cause }));
      }
    },
  };
}
