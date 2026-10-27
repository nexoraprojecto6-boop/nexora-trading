import assert from "node:assert/strict";
import { createLoader, OBSERVADOR, RISK_PARAMS } from "./helpers.mjs";

const L = await createLoader({ VITE_DERIV_AFFILIATE_TOKEN: "afiliado_TOKEN_123" });
const load = L.load;

// ---------- url ----------
const url = await load("/src/lib/url.ts");
assert.equal(url.normalizeApiBase("https://api.nexoraforex.pro/"), "https://api.nexoraforex.pro");
assert.equal(url.normalizeApiBase("http://localhost:3000"), "http://localhost:3000");
for (const bad of [undefined, "", "  ", "http://api.nexoraforex.pro", "javascript:alert(1)", "https://u:p@x.pro", "https://x.pro/?a=1", "https://x.pro/#a", "não é url"]) {
  assert.equal(url.normalizeApiBase(bad), undefined, String(bad));
}
assert.equal(url.sanitizeAffiliateToken("afiliado_TOKEN_123"), "afiliado_TOKEN_123");
for (const bad of [undefined, "", "curto", "tem espaço aqui", "x".repeat(65), "a&b=c-12345678", "<script>alert(1)</script>"]) assert.equal(url.sanitizeAffiliateToken(bad), undefined, String(bad));
assert.equal(url.buildDerivSignupUrl(), "https://hub.deriv.com/tradershub/signup");
const su = new URL(url.buildDerivSignupUrl("afiliado_TOKEN_123"));
assert.deepEqual(Object.fromEntries(su.searchParams), { t: "afiliado_TOKEN_123", utm_campaign: "NEXORA", utm_medium: "affiliate", utm_source: "afiliado_TOKEN_123" });

// ---------- env + config (com VITE_* definidas) ----------
const env = await load("/src/lib/env.ts");
assert.equal(env.API_BASE_URL, "https://api.teste.pro"); assert.equal(env.AFFILIATE_TOKEN, "afiliado_TOKEN_123");
const config = await load("/src/lib/config.ts");
assert.equal(new URL(config.derivSignupUrl()).searchParams.get("t"), "afiliado_TOKEN_123");
assert.equal(config.SUPPORT_WHATSAPP_NUMBER, "244976289984");
assert.equal(config.SUPPORT_WHATSAPP_URL("Olá, preciso de suporte"), "https://wa.me/244976289984?text=Ol%C3%A1%2C%20preciso%20de%20suporte");
assert.ok(config.TERMOS_NEXORA.includes("+244976289984") && !config.TERMOS_NEXORA.includes("+976289984"), "um só número, com indicativo");
assert.deepEqual({ ...config.FEATURES }, { admin: false, manualTrading: false, notifications: false });
assert.ok(config.MENTORIA_VIP_LINK.startsWith("https://chat.whatsapp.com/"));
const glass = await load("/src/lib/glass.ts"); assert.equal(glass.SUPPORT_WHATSAPP_NUMBER, "244976289984");

// ---------- dinheiro ----------
const money = await load("/src/lib/money.ts");
assert.equal(money.formatMoney(10000, "usd"), "10000.00 USD"); assert.equal(money.formatMoney(0.0001, "BTC"), "0.00010000 BTC"); assert.equal(money.formatMoney(null), "0.00 USD");

// ---------- mapeadores ----------
const m = await load("/src/lib/mappers.ts");
const types = await load("/src/lib/types.ts");
const sym = m.toField(OBSERVADOR.params[0], m.GROUP_BOT);
assert.equal(sym.type, "select"); assert.equal(sym.defaultValue, "R_100"); assert.ok(sym.options.some((o) => o.value === "1HZ100V")); assert.equal(sym.group, "Parâmetros do bot");
const symOdd = m.toField({ ...OBSERVADOR.params[0], default: "OUTRO_MERCADO" }, "g");
assert.ok(symOdd.options.some((o) => o.value === "OUTRO_MERCADO"), "o padrão do servidor existe sempre nas opções");
const sel = m.toField(OBSERVADOR.params[1], "g"); assert.deepEqual(sel.options.map((o) => o.value), ["60", "120", "300"]); assert.equal(sel.defaultValue, "60");
const stake = m.toField(RISK_PARAMS[0], "Limites de risco");
assert.deepEqual([stake.type, stake.valueType, stake.min, stake.max, stake.step, stake.defaultValue], ["number", "decimal", 0.01, 100000, 0.01, undefined]);
const trades = m.toField(RISK_PARAMS[2], "g"); assert.deepEqual([trades.valueType, trades.min, trades.max, trades.step], ["integer", 1, 1000, 1]);
const bot = m.toCatalogBot(OBSERVADOR, RISK_PARAMS);
assert.equal(bot.id, "observador"); assert.equal(bot.strategy, "observador"); assert.equal(bot.paramFields.length, 2); assert.equal(bot.riskFields.length, 6);
assert.ok(bot.riskFields.every((f) => f.defaultValue === undefined), "limites de risco sem valor por omissão");
assert.equal(types.STRATEGY_LABELS.observador, "Observador");
const all = [...bot.paramFields, ...bot.riskFields];
assert.equal(new Set(all.map((f) => f.key)).size, all.length, "chaves únicas");

// valores iniciais: guardado > padrão > vazio
let iv = m.initialValues(all, { symbol: "R_50", stake: "2" });
assert.equal(iv.symbol, "R_50"); assert.equal(iv.candleSeconds, "60"); assert.equal(iv.stake, "2"); assert.equal(iv.maxDailyLoss, undefined);
// payload: vazio fica de fora (nunca um 0 inventado), decimais como texto, inteiros como número
const vals = { symbol: "R_100", candleSeconds: "300", stake: "1.50", maxDailyLoss: " 10 ", maxTradesPerDay: "20", maxOpenPositions: 1, maxConsecutiveLosses: undefined, cooldownSeconds: "" };
const settings = m.toSettings(bot.paramFields, bot.riskFields, vals);
assert.deepEqual(settings.params, { symbol: "R_100", candleSeconds: "300" });
assert.deepEqual(settings.risk, { stake: "1.50", maxDailyLoss: "10", maxTradesPerDay: 20, maxOpenPositions: 1 });
assert.ok(!("maxConsecutiveLosses" in settings.risk) && !("cooldownSeconds" in settings.risk));
assert.deepEqual(m.buildPayload(bot.riskFields, { stake: true }), {});   // booleanos ignorados

// ---------- contas ----------
const { pickAccount } = await load("/src/lib/accounts.ts");
const acc = (id, virtual) => ({ id, account_id: id, loginid: id, balance: 0, currency: "USD", is_virtual: virtual, account_type: virtual ? "demo" : "real", status: "active" });
const list = [acc("CR1", false), acc("VRTC1", true), acc("VRTC2", true)];
assert.equal(pickAccount([], null), null);
assert.equal(pickAccount(list, null).account_id, "VRTC1", "por omissão a primeira DEMO (mais seguro)");
assert.equal(pickAccount(list, "CR1").account_id, "CR1");
assert.equal(pickAccount(list, "CR1", "VRTC2").account_id, "VRTC2", "a conta atual tem prioridade");
assert.equal(pickAccount(list, "NAO_EXISTE", "TAMBEM_NAO").account_id, "VRTC1");
assert.equal(pickAccount([acc("CR1", false)], null).account_id, "CR1");

// ---------- tipos/erros da API ----------
const at = await load("/src/lib/apiTypes.ts");
assert.deepEqual(at.toAccount({ accountId: "VRTC1", accountType: "demo", currency: "USD", status: "active", balance: 12.5 }),
  { id: "VRTC1", account_id: "VRTC1", loginid: "VRTC1", balance: 12.5, currency: "USD", is_virtual: true, account_type: "demo", status: "active" });
assert.equal(at.toAccount({ accountId: "CR1", accountType: "real", currency: "EUR", status: "active", balance: null }).balance, 0);
let he = at.toHttpError({ error: { code: "VALIDATION", message: "Configuração inválida.", details: { errors: { "risk.stake": "Obrigatório.", "x": 5 } } } }, 400);
assert.deepEqual([he.status, he.code, he.message, he.fieldErrors], [400, "VALIDATION", "Configuração inválida.", { "risk.stake": "Obrigatório." }]);
for (const junk of [undefined, null, "texto", [], { error: "string" }, { error: { message: 5 } }]) { he = at.toHttpError(junk, 502); assert.equal(he.status, 502); assert.equal(he.message, "Erro 502"); assert.equal(he.fieldErrors, undefined); }
assert.match(new at.FeatureUnavailableError("O painel").message, /ainda não está disponível/);

// ---------- cliente da API (fetch simulado) ----------
const { createApi } = await load("/src/lib/apiClient.ts");
const calls = [];
const respond = (status, body) => async (u, init) => { calls.push({ u, init }); return new Response(body === undefined ? null : JSON.stringify(body), { status }); };
const mk = (fn) => createApi("https://api.x.pro", fn);

assert.equal(mk(respond(200, {})).loginUrl(), "https://api.x.pro/auth/login");
assert.equal(mk(respond(200, {})).loginUrl("registration"), "https://api.x.pro/auth/login?prompt=registration");
let r = await mk(respond(200, { live: true, accounts: [{ accountId: "VRTC1", accountType: "demo", currency: "USD", status: "active", balance: 10 }] })).getAccounts();
assert.equal(r.live, true); assert.equal(r.accounts[0].is_virtual, true); assert.equal(r.accounts[0].balance, 10);
assert.equal(calls.at(-1).u, "https://api.x.pro/me/accounts"); assert.equal(calls.at(-1).init.credentials, "include"); assert.equal(calls.at(-1).init.method, "GET");
assert.equal((await mk(respond(200, { accounts: [] })).getAccounts()).live, false, "sem 'live' → false");
await assert.rejects(mk(respond(401, { error: { code: "UNAUTHORIZED", message: "Sessão" } })).getAccounts(), (e) => e.name === "HttpError" && e.status === 401 && e.code === "UNAUTHORIZED");
await assert.rejects(mk(async () => { throw new TypeError("Failed to fetch"); }).getAccounts(), (e) => e.status === 0 && e.code === "NETWORK");
await assert.rejects(createApi(undefined, respond(200, {})).getAccounts(), (e) => e.code === "CONFIG" && /VITE_API_BASE_URL/.test(e.message));
assert.equal(await mk(respond(204)).logout(), undefined); assert.equal(calls.at(-1).init.method, "POST"); assert.equal(calls.at(-1).u, "https://api.x.pro/auth/logout");
await mk(respond(204)).selectBot("observador");
assert.equal(calls.at(-1).init.method, "PUT"); assert.equal(calls.at(-1).u, "https://api.x.pro/me/bot/selection"); assert.deepEqual(JSON.parse(calls.at(-1).init.body), { botId: "observador" }); assert.equal(calls.at(-1).init.headers["Content-Type"], "application/json");
await mk(respond(200, { config: { params: {}, risk: {} } })).saveBotConfig("observador", { params: { symbol: "R_100" }, risk: { stake: "1.50" } });
assert.deepEqual(JSON.parse(calls.at(-1).init.body), { botId: "observador", params: { symbol: "R_100" }, risk: { stake: "1.50" } });
await assert.rejects(mk(respond(400, { error: { code: "VALIDATION", message: "Configuração inválida.", details: { errors: { "risk.stake": "Obrigatório." } } } })).saveBotConfig("observador", { params: {}, risk: {} }),
  (e) => e.status === 400 && e.fieldErrors["risk.stake"] === "Obrigatório.");
assert.deepEqual(await mk(respond(200, { count: 7 })).getOnlineCount(), { count: 7 });
assert.equal(calls.at(-1).init.headers["Content-Type"], undefined, "GET sem corpo não leva Content-Type");
// funcionalidades sem servidor: erro claro, sem chamar a rede
const before = calls.length; const stub = mk(respond(200, {}));
for (const fn of ["getAdminStats", "getAdminUsers", "getAdminNotifications"]) await assert.rejects(stub[fn](), (e) => e.name === "FeatureUnavailableError", fn);
await assert.rejects(stub.getMarkupStatistics({}), (e) => e.name === "FeatureUnavailableError");
assert.equal(calls.length, before, "nenhum pedido de rede para funcionalidades sem servidor");
assert.deepEqual(await stub.getAccountLabels(), { realLabel: "REAL", demoLabel: "DEMO" });
assert.deepEqual(await stub.getNotifications(), { success: true, notifications: [] });

// ---------- diagnóstico ----------
const { diagnose } = await load("/src/lib/diagnostics.ts");
const dcalls = [];
const dmk = (h) => async (u, init) => { dcalls.push({ u, init }); return h(u, init); };
const okr = (s = 200) => new Response("{}", { status: s });
const base = { base: "https://api.x.pro", pageOrigin: "https://www.x.pro", buildTime: "2026-10-26T10:00:00.000Z", violations: [] };
let lines = await diagnose({ ...base, fetchFn: dmk((u) => okr(u.endsWith("/me") ? 401 : 200)) });
assert.match(lines.join("\n"), /2\) CORS: OK/); assert.match(lines.join("\n"), /3\) \/me com cookies: OK \(estado 401/);
lines = await diagnose({ ...base, fetchFn: dmk(() => { throw new TypeError("x"); }) });
assert.match(lines.join("\n"), /1\) Ligação à API: FALHOU/); assert.ok(!lines.some((l) => l.startsWith("2)")));
lines = await diagnose({ ...base, fetchFn: dmk((u, init) => { if (init?.mode === "no-cors") return okr(); throw new TypeError("x"); }) });
assert.match(lines.join("\n"), /2\) CORS: BLOQUEADO.*https:\/\/www\.x\.pro/);

await L.close();
console.log("OK: lógica pura (url, config, mapeadores, contas, cliente da API, diagnóstico)");
process.exit(0);
