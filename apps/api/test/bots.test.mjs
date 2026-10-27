import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadAuthConfig } from "../dist/auth/config.js";
import { createAuthService } from "../dist/auth/service.js";
import { createBotService } from "../dist/bots/service.js";
import { buildApp } from "../dist/app.js";
import { runMigrations } from "../dist/db/migrate.js";
import { buildAuthorizeUrl } from "@nexora/deriv-client";
import { ok } from "@nexora/shared";
import { testDatabaseUrl } from "./helpers.mjs";

const URL_ = testDatabaseUrl();
if (URL_ === undefined) {
  console.log("TEST_DATABASE_URL não definida: testes com base de dados ignorados.");
  process.exit(0);
}
const MIG_DIR = fileURLToPath(new URL("../../../infrastructure/db/migrations", import.meta.url));
const KEY = Buffer.alloc(32, 9).toString("base64"); // chave só para testes
const WEB = "https://app.exemplo.test";
const env = { DERIV_APP_ID: "12345", DERIV_OAUTH_REDIRECT_URI: "https://api.exemplo.test/auth/callback", WEB_ORIGIN: WEB, APP_ENCRYPTION_KEY: KEY, DERIV_AFFILIATE_TOKEN: "afiliado_TOKEN_123" };

const admin = new pg.Client({ connectionString: URL_ }); await admin.connect();
await admin.query("drop schema public cascade; create schema public;");
const mig = await runMigrations({ connectionString: URL_, ssl: "disable" }, MIG_DIR);
assert.ok(mig.ok, mig.error?.message);
assert.ok(mig.value.applied.includes("0003_bots_do_utilizador"));

const pool = new pg.Pool({ connectionString: URL_ });
let accountsReturned = [];
const fakeDeriv = {
  exchangeCode: async () => ok({ accessToken: "TOKEN-EM-CLARO", expiresInSeconds: 3600 }),
  listAccounts: async () => ok(accountsReturned),
};
const authCfg = loadAuthConfig(env, "production").value;
assert.equal(authCfg.affiliateToken, "afiliado_TOKEN_123");
const service = createAuthService({ pool, deriv: fakeDeriv, config: authCfg });
const app = await buildApp({ nodeEnv: "production", logLevel: "error", host: "127.0.0.1", port: 0, database: undefined, auth: authCfg }, { auth: service, bots: createBotService(pool) });
await app.ready();

const SESSION = "__Host-nx_session";
async function loginAs(accounts) {
  accountsReturned = accounts;
  const started = await service.startLogin();
  const state = new URL(started.value.redirectUrl).searchParams.get("state");
  const done = await service.completeLogin({ code: "c", state, browserNonce: started.value.browserNonce });
  assert.ok(done.ok, done.error?.message);
  return { cookie: `${SESSION}=${done.value.sessionToken}` };
}
const acc = (accountId, accountType = "demo", balance) => ({ accountId, accountType, currency: "USD", status: "active", ...(balance !== undefined ? { balance } : {}) });
const call = (method, url, user, body, origin = WEB) =>
  app.inject({ method, url, headers: { ...(user ? { cookie: user.cookie } : {}), ...(method !== "GET" ? { origin } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { payload: JSON.stringify(body) } : {}) });

const RISK = { stake: "1.50", maxDailyLoss: "10", maxTradesPerDay: 20, maxOpenPositions: 1, maxConsecutiveLosses: 3, cooldownSeconds: 60 };

// ---------- "Criar conta" (registo) e afiliado ----------
let r = await app.inject({ url: "/auth/login?prompt=registration" });
assert.equal(r.statusCode, 302);
let loc = new URL(r.headers.location);
assert.equal(loc.searchParams.get("prompt"), "registration");
assert.equal(loc.searchParams.get("t"), "afiliado_TOKEN_123"); assert.equal(loc.searchParams.get("utm_campaign"), "NEXORA");
assert.equal(loc.searchParams.get("utm_medium"), "affiliate"); assert.equal(loc.searchParams.get("utm_source"), "afiliado_TOKEN_123");
r = await app.inject({ url: "/auth/login" });
loc = new URL(r.headers.location);
for (const k of ["prompt", "t", "utm_campaign", "utm_medium", "utm_source"]) assert.equal(loc.searchParams.has(k), false, `login normal não leva ${k}`);
assert.equal((await app.inject({ url: "/auth/login?prompt=outra" })).statusCode, 400);   // só "registration"
// sem token de afiliado: registo sem atribuição
const cfgNoAff = loadAuthConfig({ ...env, DERIV_AFFILIATE_TOKEN: undefined }, "production").value;
const urlNoAff = new URL(buildAuthorizeUrl({ clientId: "1", redirectUri: "https://x/auth/callback", scopes: ["trade"], state: "s", codeChallenge: "c", prompt: "registration" }));
assert.equal(urlNoAff.searchParams.get("prompt"), "registration"); assert.equal(urlNoAff.searchParams.has("t"), false); assert.ok(cfgNoAff.affiliateToken === undefined);
assert.equal(loadAuthConfig({ ...env, DERIV_AFFILIATE_TOKEN: "curto" }, "production").ok, false);

// ---------- bots: acesso ----------
const alice = await loginAs([acc("VRTC1", "demo", 10000), acc("CR1", "real", 25.5)]);
const bob = await loginAs([acc("VRTC2")]);
for (const [m, u] of [["GET", "/bots"], ["GET", "/bots/observador"], ["GET", "/me/bot"], ["PUT", "/me/bot/selection"], ["PUT", "/me/bot/config"]]) {
  const body = u.endsWith("selection") ? { botId: "observador" } : m === "PUT" ? { botId: "observador", risk: RISK } : undefined;
  const x = await call(m, u, undefined, body);
  assert.equal(x.statusCode, 401, `${m} ${u} sem sessão`);
}

// ---------- catálogo ----------
r = await call("GET", "/bots", alice);
assert.equal(r.statusCode, 200);
const list = r.json(); assert.ok(list.bots.length >= 1); assert.equal(list.bots[0].id, "observador"); assert.ok(list.bots[0].description.includes("NÃO abre operações"));
assert.equal(list.riskParams.length, 6); assert.ok(list.riskParams.every((p) => p.default === undefined));
r = await call("GET", "/bots/observador", alice); assert.equal(r.statusCode, 200); assert.equal(r.json().bot.params.length, 2); assert.equal(r.json().riskParams.length, 6);
assert.equal((await call("GET", "/bots/nao-existe", alice)).statusCode, 404);
assert.equal((await call("GET", "/bots/ID_INVALIDO!", alice)).statusCode, 400);

// ---------- seleção e configuração ----------
r = await call("GET", "/me/bot", alice); assert.deepEqual(r.json(), { selectedBotId: null, config: null });
assert.equal((await call("PUT", "/me/bot/selection", alice, { botId: "observador" }, "https://atacante.test")).statusCode, 403);   // CSRF
assert.equal((await call("PUT", "/me/bot/selection", alice, { botId: "nao-existe" })).statusCode, 404);
assert.equal((await call("PUT", "/me/bot/selection", alice, { botId: "observador", extra: 1 })).statusCode, 400);
assert.equal((await call("PUT", "/me/bot/selection", alice, { botId: "observador" })).statusCode, 204);
r = await call("GET", "/me/bot", alice); assert.deepEqual(r.json(), { selectedBotId: "observador", config: null });

r = await call("PUT", "/me/bot/config", alice, { botId: "observador", risk: { ...RISK, stake: "0" } });
assert.equal(r.statusCode, 400); assert.equal(r.json().error.code, "VALIDATION"); assert.match(r.json().error.details.errors["risk.stake"], /entre/);
r = await call("PUT", "/me/bot/config", alice, { botId: "observador", risk: {} });
assert.equal(r.statusCode, 400); assert.equal(r.json().error.details.errors["risk.stake"], "Obrigatório.");   // limites de risco obrigatórios
r = await call("PUT", "/me/bot/config", alice, { botId: "observador", params: { symbol: "R 50" }, risk: RISK });
assert.equal(r.statusCode, 400); assert.ok(r.json().error.details.errors["params.symbol"]);
assert.equal((await call("PUT", "/me/bot/config", alice, { botId: "observador", risk: RISK }, "https://atacante.test")).statusCode, 403);
assert.equal((await call("PUT", "/me/bot/config", alice, { botId: "nao-existe", risk: RISK })).statusCode, 404);
assert.equal((await call("PUT", "/me/bot/config", alice, { risk: RISK })).statusCode, 400);                       // sem botId
assert.equal((await admin.query("select count(*)::int n from user_bot_configs")).rows[0].n, 0);                    // nada guardado em erro

r = await call("PUT", "/me/bot/config", alice, { botId: "observador", params: { symbol: "R_50", candleSeconds: "300" }, risk: RISK });
assert.equal(r.statusCode, 200);
assert.deepEqual(r.json().config, { params: { symbol: "R_50", candleSeconds: "300" }, risk: { stake: "1.5", maxDailyLoss: "10", maxTradesPerDay: 20, maxOpenPositions: 1, maxConsecutiveLosses: 3, cooldownSeconds: 60 } });
r = await call("GET", "/me/bot", alice); assert.equal(r.json().config.params.symbol, "R_50"); assert.equal(r.json().config.risk.stake, "1.5");   // dinheiro como texto exato
// atualizar substitui (não duplica)
await call("PUT", "/me/bot/config", alice, { botId: "observador", params: {}, risk: { ...RISK, stake: "2" } });
assert.equal((await admin.query("select count(*)::int n from user_bot_configs")).rows[0].n, 1);
assert.equal((await call("GET", "/me/bot", alice)).json().config.risk.stake, "2");
// isolamento entre utilizadores
r = await call("GET", "/me/bot", bob); assert.deepEqual(r.json(), { selectedBotId: null, config: null });
await call("PUT", "/me/bot/selection", bob, { botId: "observador" });
assert.deepEqual((await call("GET", "/me/bot", bob)).json(), { selectedBotId: "observador", config: null });
// configuração antiga que deixou de ser válida (catálogo mudou) deixa de ser usada
await admin.query("update user_bot_configs set risk = '{\"stake\":\"0\"}'::jsonb");
assert.equal((await call("GET", "/me/bot", alice)).json().config, null);
// bot retirado do catálogo → seleção deixa de valer
await admin.query("update user_selected_bot set bot_id = 'bot-removido'");
assert.deepEqual((await call("GET", "/me/bot", alice)).json(), { selectedBotId: null, config: null });

// ---------- contas com saldo ----------
accountsReturned = [acc("VRTC1", "demo", 10000), acc("CR1", "real", 25.5), acc("DE_OUTRO_UTILIZADOR", "real", 999)];
r = await call("GET", "/me/accounts", alice);
assert.equal(r.statusCode, 200); const view = r.json();
assert.equal(view.live, true);
assert.equal(view.accounts.length, 2);
assert.ok(!view.accounts.some((a) => a.accountId === "DE_OUTRO_UTILIZADOR"), "nunca devolve contas de outro utilizador");
assert.equal(view.accounts.find((a) => a.accountId === "VRTC1").balance, 10000);
assert.ok(!JSON.stringify(view).includes("TOKEN"));
// sem token válido: contas guardadas, sem saldo, sem erro
await admin.query("update deriv_credentials set access_expires_at = now() - interval '1 second'");
r = await call("GET", "/me/accounts", alice); assert.equal(r.statusCode, 200);
assert.equal(r.json().live, false); assert.ok(r.json().accounts.length === 2 && r.json().accounts.every((a) => a.balance === null));
assert.equal((await call("GET", "/me/accounts")).statusCode, 401);
// a Deriv recusa o token → também sem erro para o utilizador
await admin.query("update deriv_credentials set access_expires_at = now() + interval '1 hour'");
fakeDeriv.listAccounts = async () => ({ ok: false, error: new Error("401") });
r = await call("GET", "/me/accounts", alice); assert.equal(r.statusCode, 200); assert.equal(r.json().live, false);

// ---------- online ----------
r = await call("GET", "/online-count", alice); assert.equal(r.statusCode, 200); assert.ok(r.json().count >= 2);
assert.equal((await call("GET", "/online-count")).statusCode, 401);
await admin.query("update sessions set last_seen_at = now() - interval '10 minutes'");
assert.equal((await call("GET", "/online-count", undefined)).statusCode, 401);

// ---------- CORS dos novos métodos ----------
r = await app.inject({ method: "OPTIONS", url: "/me/bot/config", headers: { origin: WEB, "access-control-request-method": "PUT", "access-control-request-headers": "content-type" } });
assert.match(r.headers["access-control-allow-methods"], /PUT/); assert.equal(r.headers["access-control-allow-origin"], WEB);

await app.close(); await pool.end(); await admin.end();
console.log("OK: bots, contas, online e registo");
process.exit(0);
