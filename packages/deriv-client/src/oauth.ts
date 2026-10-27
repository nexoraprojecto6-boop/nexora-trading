import { AppError, err, ok, type Result } from "@nexora/shared";
import { DERIV_REST_BASE_URL } from "./constants.js";

/** Endpoints OAuth 2.0 oficiais (Authorization Code + PKCE). */
export const DERIV_OAUTH_AUTHORIZE_URL = "https://auth.deriv.com/oauth2/auth";
export const DERIV_OAUTH_TOKEN_URL = "https://auth.deriv.com/oauth2/token";

export type OAuthScope = "trade" | "payment" | "account_manage" | "application_read";

export interface AuthorizeUrlParams {
  /** O `client_id` é o App ID registado na Deriv. */
  readonly clientId: string;
  /** Tem de coincidir exatamente com o URI registado na Deriv. */
  readonly redirectUri: string;
  readonly scopes: readonly OAuthScope[];
  readonly state: string;
  /** BASE64URL(SHA256(code_verifier)). */
  readonly codeChallenge: string;
  /** `registration` mostra o formulário de criação de conta em vez do login. */
  readonly prompt?: "registration";
  /** Atribuição de parceiro (só se aplica com `prompt: "registration"`). */
  readonly affiliate?: { readonly token: string; readonly campaign: string };
}

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(DERIV_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.prompt === "registration") {
    url.searchParams.set("prompt", "registration");
    if (params.affiliate !== undefined) {
      // Mesmos parâmetros do link de afiliado da Deriv (a documentação pede um só nome para o token).
      url.searchParams.set("t", params.affiliate.token);
      url.searchParams.set("utm_campaign", params.affiliate.campaign);
      url.searchParams.set("utm_medium", "affiliate");
      url.searchParams.set("utm_source", params.affiliate.token);
    }
  }
  return url.toString();
}

export interface TokenResponse {
  /** Segredo. Nunca registar. */
  readonly accessToken: string;
  /** Segredo. Nunca registar. */
  readonly refreshToken?: string;
  readonly expiresInSeconds?: number;
  readonly scope?: string;
}

export interface DerivAccount {
  readonly accountId: string;
  readonly accountType: "demo" | "real";
  readonly currency: string;
  readonly status: "active" | "inactive";
  /** Saldo atual, quando a Deriv o devolve. Nunca é guardado na base de dados. */
  readonly balance?: number;
}

export interface ExchangeCodeInput {
  readonly clientId: string;
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
}

/** Operações de autenticação junto da Deriv. Injetável para testes. */
export interface DerivAuthClient {
  exchangeCode(input: ExchangeCodeInput): Promise<Result<TokenResponse>>;
  listAccounts(accessToken: string): Promise<Result<DerivAccount[]>>;
}

export interface DerivAuthClientOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function safeOAuthError(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const value = body["error"];
  return typeof value === "string" && /^[a-z_]{1,40}$/.test(value) ? value : null;
}

export function createDerivAuthClient(options: DerivAuthClientOptions = {}): DerivAuthClient {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    async exchangeCode(input) {
      let response: Response;
      try {
        response = await fetchFn(DERIV_OAUTH_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: input.clientId,
            code: input.code,
            redirect_uri: input.redirectUri,
            code_verifier: input.codeVerifier,
          }).toString(),
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
      } catch (cause) {
        return err(new AppError("UPSTREAM", "Não foi possível contactar o servidor de autorização da Deriv.", { cause }));
      }

      const body = await readJson(response);
      if (!response.ok) {
        const code = response.status === 400 || response.status === 401 ? "UNAUTHORIZED" : "UPSTREAM";
        return err(
          new AppError(code, "A Deriv recusou o código de autorização.", {
            details: { httpStatus: response.status, oauthError: safeOAuthError(body) },
          }),
        );
      }

      if (!isRecord(body)) return err(new AppError("UPSTREAM", "Resposta de token da Deriv inválida."));
      const accessToken = body["access_token"];
      const tokenType = body["token_type"];
      const refreshToken = body["refresh_token"];
      const expiresIn = body["expires_in"];
      const scope = body["scope"];
      if (typeof accessToken !== "string" || accessToken === "") {
        return err(new AppError("UPSTREAM", "Resposta de token da Deriv sem access_token."));
      }
      if (typeof tokenType === "string" && tokenType.toLowerCase() !== "bearer") {
        return err(new AppError("UPSTREAM", "Tipo de token da Deriv não suportado."));
      }
      return ok({
        accessToken,
        ...(typeof refreshToken === "string" && refreshToken !== "" ? { refreshToken } : {}),
        ...(typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
          ? { expiresInSeconds: Math.floor(expiresIn) }
          : {}),
        ...(typeof scope === "string" && scope !== "" ? { scope } : {}),
      });
    },

    async listAccounts(accessToken) {
      let response: Response;
      try {
        response = await fetchFn(`${DERIV_REST_BASE_URL}/trading/v1/options/accounts`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
      } catch (cause) {
        return err(new AppError("UPSTREAM", "Não foi possível contactar a API da Deriv.", { cause }));
      }
      if (!response.ok) {
        const code = response.status === 401 ? "UNAUTHORIZED" : response.status === 403 ? "FORBIDDEN" : "UPSTREAM";
        return err(new AppError(code, "A Deriv recusou o pedido da lista de contas.", { details: { httpStatus: response.status } }));
      }
      const body = await readJson(response);
      const data = isRecord(body) ? body["data"] : undefined;
      if (!Array.isArray(data)) return err(new AppError("UPSTREAM", "Lista de contas da Deriv inválida."));

      const accounts: DerivAccount[] = [];
      for (const item of data as unknown[]) {
        if (!isRecord(item)) return err(new AppError("UPSTREAM", "Conta da Deriv inválida."));
        const { account_id: accountId, account_type: accountType, currency, status, balance } = item;
        if (
          typeof accountId !== "string" || accountId === "" ||
          (accountType !== "demo" && accountType !== "real") ||
          typeof currency !== "string" || currency === "" ||
          (status !== "active" && status !== "inactive")
        ) {
          return err(new AppError("UPSTREAM", "Conta da Deriv com campos inválidos."));
        }
        const parsedBalance = typeof balance === "number" ? balance : typeof balance === "string" && balance.trim() !== "" ? Number(balance) : Number.NaN;
        accounts.push({
          accountId,
          accountType,
          currency,
          status,
          ...(Number.isFinite(parsedBalance) ? { balance: parsedBalance } : {}),
        });
      }
      return ok(accounts);
    },
  };
}
