import { AppError, err, ok, type NodeEnv, type Result } from "@nexora/shared";
import { parseEncryptionKey } from "./crypto.js";

export interface AuthConfig {
  /** App ID da Deriv (= `client_id` do OAuth). */
  readonly appId: string;
  /** URL de retorno registado na Deriv. Termina sempre em /auth/callback. */
  readonly redirectUri: string;
  /** Origem do frontend (sem barra final). Único destino de redirecionamentos pós-login. */
  readonly webOrigin: string;
  readonly encryptionKey: Buffer;
  readonly sessionTtlSeconds: number;
  readonly loginAttemptTtlSeconds: number;
  /** Cookies com atributo Secure e prefixo __Host-. */
  readonly cookieSecure: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

const REQUIRED = ["DERIV_APP_ID", "DERIV_OAUTH_REDIRECT_URI", "WEB_ORIGIN", "APP_ENCRYPTION_KEY"] as const;

function isLocalhost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function parseHttpUrl(name: string, raw: string, nodeEnv: NodeEnv): Result<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return err(new AppError("CONFIG", `${name} inválida: tem de ser um URL absoluto.`));
  }
  const httpsOk = url.protocol === "https:";
  const localHttpOk = url.protocol === "http:" && isLocalhost(url) && nodeEnv !== "production";
  if (!httpsOk && !localHttpOk) {
    return err(new AppError("CONFIG", `${name} inválida: tem de usar https:// (http só em localhost fora de produção).`));
  }
  if (url.hash !== "" || url.username !== "" || url.password !== "") {
    return err(new AppError("CONFIG", `${name} inválida: não pode ter fragmento nem credenciais.`));
  }
  return ok(url);
}

/**
 * Autenticação é opcional: sem nenhuma das variáveis, devolve `undefined` e as rotas /auth/*
 * respondem 503. Com configuração parcial, falha (nunca arranca a meio).
 * Os valores recebidos nunca são repetidos nas mensagens de erro.
 */
export function loadAuthConfig(env: Env, nodeEnv: NodeEnv): Result<AuthConfig | undefined> {
  const values = new Map<string, string>();
  for (const name of REQUIRED) {
    const value = env[name]?.trim();
    if (value !== undefined && value !== "") values.set(name, value);
  }
  if (values.size === 0) return ok(undefined);

  const missing = REQUIRED.filter((name) => !values.has(name));
  if (missing.length > 0) {
    return err(new AppError("CONFIG", `Configuração de autenticação incompleta. Em falta: ${missing.join(", ")}.`));
  }

  const appId = values.get("DERIV_APP_ID") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(appId)) {
    return err(new AppError("CONFIG", "DERIV_APP_ID inválido: só letras, números, '_' e '-' (até 64)."));
  }

  const redirect = parseHttpUrl("DERIV_OAUTH_REDIRECT_URI", values.get("DERIV_OAUTH_REDIRECT_URI") ?? "", nodeEnv);
  if (!redirect.ok) return redirect;
  if (redirect.value.pathname !== "/auth/callback" || redirect.value.search !== "") {
    return err(new AppError("CONFIG", "DERIV_OAUTH_REDIRECT_URI tem de terminar em /auth/callback, sem parâmetros."));
  }

  const web = parseHttpUrl("WEB_ORIGIN", values.get("WEB_ORIGIN") ?? "", nodeEnv);
  if (!web.ok) return web;
  if (values.get("WEB_ORIGIN") !== web.value.origin) {
    return err(new AppError("CONFIG", "WEB_ORIGIN tem de ser só a origem (esquema, anfitrião e porta), sem caminho nem barra final."));
  }

  const key = parseEncryptionKey(values.get("APP_ENCRYPTION_KEY") ?? "");
  if (!key.ok) return key;

  return ok({
    appId,
    redirectUri: redirect.value.toString(),
    webOrigin: web.value.origin,
    encryptionKey: key.value,
    sessionTtlSeconds: 8 * 60 * 60,
    loginAttemptTtlSeconds: 10 * 60,
    cookieSecure: nodeEnv === "production",
  });
}
