import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadAuthConfig } from "../dist/auth/config.js";
import { decryptSecret, parseEncryptionKey, randomToken } from "../dist/auth/crypto.js";
import { createAuthService } from "../dist/auth/service.js";
import { buildApp } from "../dist/app.js";
import { runMigrations } from "../dist/db/migrate.js";
import { AppError, err, ok } from "@nexora/shared";
import { testDatabaseUrl } from "./helpers.mjs";

const URL_ = testDatabaseUrl();
if (URL_ === undefined) {
  console.log("TEST_DATABASE_URL não definida: testes com base de dados ignorados.");
  process.exit(0);
}
const KEY = Buffer.alloc(32, 7).toString("base64"); // chave só para testes
const WEB = "https://app.exemplo.test";
const good = { DERIV_APP_ID: "12345", DERIV_OAUTH_REDIRECT_URI: "https://api.exemplo.test/auth/callback", WEB_ORIGIN: WEB, APP_ENCRYPTION_KEY: KEY };
const MIG_DIR = fileURLToPath(new URL("../../../infrastructure/db/migrations", import.meta.url));
const key = parseEncryptionKey(KEY).value;

// ---------- integração com PostgreSQL real ----------
const admin = new pg.Client({ connectionString: URL_ }); await admin.connect();
await admin.query("drop schema public cascade; create schema public;");
const mig = await runMigrations({ connectionString: URL_, ssl: "disable" }, MIG_DIR);
assert.ok(mig.ok, mig.error?.message); assert.deepEqual(mig.value.applied, ["0001_funcao_updated_at", "0002_autenticacao", "0003_bots_do_utilizador"]);

const pool = new pg.Pool({ connectionString: URL_ });
// Deriv simulada: só aceita o código se o verifier corresponder ao challenge enviado no login.
let lastChallenge; let accountsToReturn = [{ accountId: "CR1", accountType: "real", currency: "USD", status: "active" }, { accountId: "VRTC1", accountType: "demo", currency: "USD", status: "active" }];
let exchanged = 0;
const fakeDeriv = {
  async exchangeCode({ code, codeVerifier, clientId, redirectUri }) {
    exchanged++;
    assert.equal(clientId, "12345"); assert.equal(redirectUri, good.DERIV_OAUTH_REDIRECT_URI);
    if (code !== "good-code") return err(new AppError("UNAUTHORIZED", "recusado"));
    if (createHash("sha256").update(codeVerifier).digest("base64url") !== lastChallenge) return err(new AppError("UNAUTHORIZED", "pkce"));
    return ok({ accessToken: "ACCESS-TOKEN-EM-CLARO", refreshToken: "REFRESH-TOKEN-EM-CLARO", expiresInSeconds: 3600, scope: "trade" });
  },
  async listAccounts(at) { assert.equal(at, "ACCESS-TOKEN-EM-CLARO"); return ok(accountsToReturn); },
};
const authCfg = loadAuthConfig(good, "production").value;
const service = createAuthService({ pool, deriv: fakeDeriv, config: authCfg });
const base = { nodeEnv: "production", logLevel: "error", host: "127.0.0.1", port: 0, database: undefined, auth: authCfg };
const app = await await buildApp(base, { auth: service }); await app.ready();
const SESSION = "__Host-nx_session", OAUTH = "__Host-nx_oauth";
const setCookies = (res) => [].concat(res.headers["set-cookie"] ?? []);
const cookieVal = (res, name) => { const c = setCookies(res).find((x) => x.startsWith(name + "=")); return c ? c.split(";")[0].slice(name.length + 1) : undefined; };

async function login() {
  const r = await app.inject({ url: "/auth/login" });
  assert.equal(r.statusCode, 302);
  const loc = new URL(r.headers.location);
  assert.equal(loc.origin + loc.pathname, "https://auth.deriv.com/oauth2/auth");
  assert.equal(loc.searchParams.get("scope"), "trade"); assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
  lastChallenge = loc.searchParams.get("code_challenge");
  const oc = setCookies(r).find((x) => x.startsWith(OAUTH + "="));
  assert.match(oc, /HttpOnly/); assert.match(oc, /Secure/); assert.match(oc, /SameSite=Lax/); assert.match(oc, /Max-Age=600/);
  return { state: loc.searchParams.get("state"), nonce: cookieVal(r, OAUTH) };
}
const cb = (qs, nonce) => app.inject({ url: "/auth/callback?" + new URLSearchParams(qs), headers: nonce ? { cookie: `${OAUTH}=${nonce}` } : {} });

// fluxo feliz
let a = await login();
let r = await cb({ code: "good-code", state: a.state }, a.nonce);
assert.equal(r.statusCode, 302); assert.equal(r.headers.location, WEB + "/callback");
const sess = cookieVal(r, SESSION); assert.equal(sess.length, 43);
const sc = setCookies(r).find((x) => x.startsWith(SESSION + "=")); assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/);
assert.match(setCookies(r).find((x) => x.startsWith(OAUTH + "=")), /Max-Age=0/);
// /me
r = await app.inject({ url: "/me", headers: { cookie: `${SESSION}=${sess}` } });
assert.equal(r.statusCode, 200); let me = r.json(); assert.equal(me.user.accounts.length, 2); assert.deepEqual(me.user.accounts.map((x) => x.accountId), ["VRTC1", "CR1"]);
assert.ok(!r.body.includes("TOKEN"));
const userId = me.user.id;
// BD: segredos cifrados, hashes
let row = (await admin.query("select * from deriv_credentials")).rows[0];
assert.ok(!row.access_token_enc.includes("EM-CLARO") && !row.refresh_token_enc.includes("EM-CLARO")); assert.equal(row.scope, "trade"); assert.ok(row.access_expires_at > new Date());
assert.equal(decryptSecret(key, row.access_token_enc, `deriv_token:${userId}`).value, "ACCESS-TOKEN-EM-CLARO");
assert.equal(decryptSecret(key, row.access_token_enc, `deriv_token:outro`).ok, false);
const sRows = (await admin.query("select token_hash from sessions")).rows; assert.equal(sRows.length, 1); assert.notEqual(sRows[0].token_hash, sess); assert.equal(sRows[0].token_hash.length, 64);
assert.equal((await admin.query("select count(*)::int n from oauth_login_attempts")).rows[0].n, 0);

// replay do mesmo state
r = await cb({ code: "good-code", state: a.state }, a.nonce); assert.equal(r.headers.location, WEB + "/callback?error=login_failed"); assert.equal(cookieVal(r, SESSION), undefined);
// sem cookie / cookie de outro browser / state desconhecido
a = await login();
for (const [nonce, st] of [[undefined, a.state], [randomToken(), a.state], [a.nonce, randomToken()]]) {
  r = await cb({ code: "good-code", state: st }, nonce); assert.equal(r.headers.location, WEB + "/callback?error=login_failed"); assert.equal(cookieVal(r, SESSION), undefined);
}
const before = exchanged;
// a tentativa foi consumida pelo teste do cookie errado → já não serve
r = await cb({ code: "good-code", state: a.state }, a.nonce); assert.equal(r.headers.location, WEB + "/callback?error=login_failed"); assert.equal(exchanged, before);
// erro vindo da Deriv
a = await login(); r = await cb({ error: "access_denied", error_description: "SEGREDO-NA-URL", state: a.state }, a.nonce);
assert.equal(r.headers.location, WEB + "/callback?error=access_denied"); assert.ok(!JSON.stringify(r.headers).includes("SEGREDO"));
a = await login(); r = await cb({ error: "server_error SEGREDO-NA-URL", state: a.state }, a.nonce);
assert.equal(r.headers.location, WEB + "/callback?error=login_failed"); assert.ok(!JSON.stringify(r.headers).includes("SEGREDO"));
// código recusado pela Deriv
a = await login(); r = await cb({ code: "mau", state: a.state }, a.nonce); assert.equal(r.headers.location, WEB + "/callback?error=login_failed"); assert.equal(cookieVal(r, SESSION), undefined);
// tentativa expirada
a = await login(); await admin.query("update oauth_login_attempts set expires_at = now() - interval '1 second'");
const b2 = exchanged; r = await cb({ code: "good-code", state: a.state }, a.nonce); assert.equal(r.headers.location, WEB + "/callback?error=login_failed"); assert.equal(exchanged, b2);
// parâmetros demasiado longos
r = await app.inject({ url: "/auth/callback?code=" + "a".repeat(3000) + "&state=x" }); assert.equal(r.statusCode, 400);

// identidade estável: novo login com as mesmas contas (e uma nova) → mesmo utilizador
accountsToReturn = [...accountsToReturn, { accountId: "CR2", accountType: "real", currency: "EUR", status: "active" }];
a = await login(); r = await cb({ code: "good-code", state: a.state }, a.nonce);
const sess2 = cookieVal(r, SESSION); assert.notEqual(sess2, sess);
me = (await app.inject({ url: "/me", headers: { cookie: `${SESSION}=${sess2}` } })).json();
assert.equal(me.user.id, userId); assert.equal(me.user.accounts.length, 3);
assert.equal((await admin.query("select count(*)::int n from users")).rows[0].n, 1);
// conta já de outro utilizador nunca é reatribuída
accountsToReturn = [{ accountId: "OUTRA", accountType: "real", currency: "USD", status: "active" }];
a = await login(); r = await cb({ code: "good-code", state: a.state }, a.nonce); const u2 = (await app.inject({ url: "/me", headers: { cookie: `${SESSION}=${cookieVal(r, SESSION)}` } })).json().user.id;
assert.notEqual(u2, userId);
accountsToReturn = [{ accountId: "OUTRA", accountType: "real", currency: "USD", status: "active" }, { accountId: "CR1", accountType: "real", currency: "USD", status: "active" }];
a = await login(); r = await cb({ code: "good-code", state: a.state }, a.nonce);
assert.equal((await admin.query("select user_id from deriv_accounts where account_id='CR1'")).rows[0].user_id, userId, "CR1 não pode mudar de dono");
// conta sem contas de trading
accountsToReturn = []; a = await login(); r = await cb({ code: "good-code", state: a.state }, a.nonce); assert.equal(r.headers.location, WEB + "/callback?error=login_failed");
accountsToReturn = [{ accountId: "CR1", accountType: "real", currency: "USD", status: "active" }];

// /me sem sessão, lixo, expirada
assert.equal((await app.inject({ url: "/me" })).statusCode, 401);
assert.equal((await app.inject({ url: "/me", headers: { cookie: `${SESSION}=lixo` } })).statusCode, 401);
assert.equal((await app.inject({ url: "/me", headers: { cookie: `${SESSION}=${randomToken()}` } })).statusCode, 401);
await admin.query("update sessions set expires_at = now() - interval '1 second' where token_hash = $1", [createHash("sha256").update(sess).digest("hex")]);
assert.equal((await app.inject({ url: "/me", headers: { cookie: `${SESSION}=${sess}` } })).statusCode, 401);

// logout: CSRF
assert.equal((await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: `${SESSION}=${sess2}` } })).statusCode, 403);
assert.equal((await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: `${SESSION}=${sess2}`, origin: "https://atacante.test" } })).statusCode, 403);
assert.equal((await app.inject({ url: "/me", headers: { cookie: `${SESSION}=${sess2}` } })).statusCode, 200);
r = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: `${SESSION}=${sess2}`, origin: WEB } });
assert.equal(r.statusCode, 204); assert.match(setCookies(r)[0], /Max-Age=0/);
assert.equal((await app.inject({ url: "/me", headers: { cookie: `${SESSION}=${sess2}` } })).statusCode, 401);
assert.equal((await admin.query("select count(*)::int n from deriv_credentials where user_id=$1", [userId])).rows[0].n, 0);

// logins concorrentes da mesma conta nova → um único utilizador
accountsToReturn = [{ accountId: "NOVA", accountType: "real", currency: "USD", status: "active" }];
const users0 = (await admin.query("select count(*)::int n from users")).rows[0].n;
const fresh = [];
for (let i = 0; i < 3; i++) fresh.push(await login());
const skipPkce = { ...fakeDeriv, async exchangeCode(i) { return ok({ accessToken: "ACCESS-TOKEN-EM-CLARO", expiresInSeconds: 60 }); } };
const svc2 = createAuthService({ pool, deriv: skipPkce, config: authCfg });
const outs = await Promise.all(fresh.map((f) => svc2.completeLogin({ code: "c", state: f.state, browserNonce: f.nonce })));
assert.ok(outs.every((o) => o.ok), outs.map((o) => o.error?.message).join());
assert.equal((await admin.query("select count(distinct user_id)::int n from deriv_accounts where account_id='NOVA'")).rows[0].n, 1);
assert.equal((await admin.query("select count(*)::int n from users")).rows[0].n, users0 + 1);

// limpeza oportunista de tentativas expiradas
await admin.query("insert into oauth_login_attempts(state_hash, browser_hash, code_verifier_enc, expires_at) values ('x','y','z', now() - interval '1 hour')");
await login(); assert.equal((await admin.query("select count(*)::int n from oauth_login_attempts where state_hash='x'")).rows[0].n, 0);

// CORS: só a origem do frontend, com credenciais
r = await app.inject({ method: "OPTIONS", url: "/me", headers: { origin: WEB, "access-control-request-method": "GET" } });
assert.ok(r.statusCode === 204 || r.statusCode === 200); assert.equal(r.headers["access-control-allow-origin"], WEB); assert.equal(r.headers["access-control-allow-credentials"], "true");
r = await app.inject({ method: "OPTIONS", url: "/auth/logout", headers: { origin: WEB, "access-control-request-method": "POST" } });
assert.match(r.headers["access-control-allow-methods"], /POST/); assert.equal(r.headers["access-control-allow-origin"], WEB);
r = await app.inject({ url: "/me", headers: { origin: WEB } }); assert.equal(r.headers["access-control-allow-origin"], WEB); assert.equal(r.statusCode, 401);
r = await app.inject({ method: "OPTIONS", url: "/me", headers: { origin: "https://atacante.test", "access-control-request-method": "GET" } });
assert.notEqual(r.headers["access-control-allow-origin"], "https://atacante.test"); // nunca ecoa a origem do atacante
r = await app.inject({ url: "/me", headers: { origin: "https://atacante.test" } }); assert.notEqual(r.headers["access-control-allow-origin"], "https://atacante.test"); assert.notEqual(r.headers["access-control-allow-origin"], "*");
// sem autenticação configurada → sem CORS
const appNoAuth = await buildApp({ ...base, auth: undefined }); await appNoAuth.ready();
r = await appNoAuth.inject({ url: "/health", headers: { origin: WEB } }); assert.equal(r.headers["access-control-allow-origin"], undefined); await appNoAuth.close();

// auth não configurada → 503
const app2 = await buildApp({ ...base, auth: undefined }); await app2.ready();
for (const [m, u] of [["GET", "/auth/login"], ["GET", "/auth/callback"], ["GET", "/me"], ["POST", "/auth/logout"]]) assert.equal((await app2.inject({ method: m, url: u })).statusCode, 503, u);
await app2.close(); await app.close(); await pool.end(); await admin.end();
console.log("TODOS OS TESTES DE AUTENTICAÇÃO PASSARAM");
process.exit(0);
