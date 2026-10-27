// Testes de interface: o código REAL da aplicação (carregado pelo Vite) a correr num browser simulado (jsdom).
// Não há mocks de módulos: só rede (fetch), WebSocket e navegação são simulados.
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createLoader, OBSERVADOR, RISK_PARAMS } from "./helpers.mjs";

// ---------- browser simulado (antes de importar React) ----------
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: "https://www.nexoraforex.pro/", pretendToBeVisual: true });
const w = dom.window;
for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Node", "Element", "Event", "MouseEvent", "MutationObserver", "getComputedStyle", "localStorage", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "SVGElement", "KeyboardEvent"]) {
  Object.defineProperty(globalThis, k, { value: k === "window" ? w : w[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
w.matchMedia = w.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
globalThis.matchMedia = w.matchMedia;
class FakeWS { static OPEN = 1; static CONNECTING = 0; static CLOSED = 3; constructor(url) { this.url = url; this.readyState = 0; FakeWS.instances.push(this); } send() {} close() { this.readyState = 3; } }
FakeWS.instances = [];
globalThis.WebSocket = FakeWS; w.WebSocket = FakeWS;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Routes, Route, useLocation } = await import("react-router-dom");
const { act } = React;

const L = await createLoader({ VITE_DERIV_AFFILIATE_TOKEN: "afiliado_TOKEN_123" });
const load = L.load;
const { nav } = await load("/src/lib/navigation.ts");
const { LoaderProvider } = await load("/src/context/LoaderContext.tsx");
const { TradingProvider } = await load("/src/context/TradingContext.tsx");
const { AuthContext, AuthProvider, useAuth } = await load("/src/context/AuthContext.tsx");
const { BotsContext, BotsProvider } = await load("/src/context/BotsContext.tsx");
const { toCatalogBot } = await load("/src/lib/mappers.ts");

// ---------- utilitários ----------
const h = React.createElement;
let mounted = [];
async function mount(el) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(el); });
  const m = {
    container,
    rerender: async (e) => { await act(async () => { root.render(e); }); },
    unmount: async () => { await act(async () => { root.unmount(); container.remove(); }); },
  };
  mounted.push(m);
  return m;
}
async function cleanup() { for (const m of mounted) { try { await m.unmount(); } catch { /* já desmontado */ } } mounted = []; document.body.innerHTML = ""; localStorage.clear(); }
const all = (sel, text) => [...document.body.querySelectorAll(sel)].filter((e) => text === undefined || e.textContent.includes(text));
const find = (sel, text) => all(sel, text)[0];
const text = () => document.body.textContent;
async function click(el) { assert.ok(el, "elemento para clicar não encontrado"); await act(async () => { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }); }
async function setValue(el, value) {
  assert.ok(el, "campo não encontrado");
  const proto = el.tagName === "SELECT" ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); el.dispatchEvent(new w.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
const settle = async (ms = 20) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const accounts = [
  { id: "CR1", account_id: "CR1", loginid: "CR1", balance: 25.5, currency: "USD", is_virtual: false, account_type: "real", status: "active" },
  { id: "VRTC1", account_id: "VRTC1", loginid: "VRTC1", balance: 10000, currency: "USD", is_virtual: true, account_type: "demo", status: "active" },
];
const fakeAuth = (o = {}) => ({ isAuthenticated: true, isLoading: false, sessionError: null, accounts, currentAccount: accounts[1], derivLive: true, setCurrentAccount: async () => {}, logout: async () => {}, refreshAccounts: async () => {}, refresh: async () => true, isAdmin: false, localUser: null, ...o });
const withAuth = (value, child) => h(AuthContext.Provider, { value }, child);
const Where = () => h("span", { "data-testid": "where" }, useLocation().pathname);
const where = () => find('[data-testid="where"]')?.textContent;

const results = [];
async function scenario(name, fn) { try { await fn(); results.push(name); } finally { await cleanup(); globalThis.fetch = undefined; nav.go = () => { throw new Error("nav.go não simulado"); }; } }

// =====================================================================
await scenario("LoginPage: entrar/criar conta com a Deriv, termos e redirecionamentos", async () => {
  const gone = []; nav.go = (u) => gone.push(u);
  const page = (auth) => h(MemoryRouter, null, h(LoaderProvider, null, withAuth(auth, h(Routes, null, h(Route, { path: "/", element: h(LoginPageC) }), h(Route, { path: "/dashboard", element: h("div", null, "DASH", h(Where)) })))));
  const LoginPageC = (await load("/src/pages/LoginPage.tsx")).default;

  await mount(page(fakeAuth({ isAuthenticated: false, accounts: [], currentAccount: null })));
  assert.ok(text().includes("NEXORA FOREX"));
  assert.ok(find("button", "Entrar com a Deriv") && find("button", "Criar conta na Deriv"));
  assert.equal(document.body.querySelectorAll('input[type="email"], input[type="password"], input[type="text"]').length, 0, "o login por email/senha já não existe");
  assert.ok(!text().includes("Esqueci"));
  assert.equal(find("pre"), undefined, "sem erro de sessão, sem detalhes técnicos");

  // sem termos aceites: abre o modal e não navega
  await click(find("button", "Entrar com a Deriv"));
  assert.ok(text().includes("Termos e Condições")); assert.equal(gone.length, 0);
  assert.ok(text().includes("+244976289984"), "contacto com indicativo");
  // recusar: fecha e não navega
  await click(find("button", "Não aceito"));
  assert.ok(!text().includes("Termos e Condições")); assert.equal(gone.length, 0); assert.equal(localStorage.getItem("nexora_terms_accepted_v1"), null);
  // aceitar: guarda e vai para o servidor (que redireciona para a Deriv)
  await click(find("button", "Entrar com a Deriv"));
  await click(find("button", "Li e aceito os termos"));
  assert.equal(localStorage.getItem("nexora_terms_accepted_v1"), "1");
  assert.deepEqual(gone, ["https://api.teste.pro/auth/login"]);
  // termos já aceites: "Criar conta" vai direto, com prompt=registration
  await click(find("button", "Criar conta na Deriv"));
  assert.ok(!text().includes("Termos e Condições"));
  assert.deepEqual(gone.at(-1), "https://api.teste.pro/auth/login?prompt=registration");
  assert.equal(gone.length, 2);
  await cleanup();

  // pedido de "criar conta" antes dos termos: depois de aceitar, mantém o pedido original
  gone.length = 0;
  const m = await mount(page(fakeAuth({ isAuthenticated: false, accounts: [], currentAccount: null })));
  await click(find("button", "Criar conta na Deriv")); await click(find("button", "Li e aceito os termos"));
  assert.deepEqual(gone, ["https://api.teste.pro/auth/login?prompt=registration"]);
  await m.unmount();

  // com sessão: segue para o painel
  await mount(page(fakeAuth()));
  assert.equal(where(), "/dashboard");
  await cleanup();

  // a carregar a sessão: sem botões
  await mount(page(fakeAuth({ isLoading: true, isAuthenticated: false })));
  assert.equal(find("button", "Entrar com a Deriv"), undefined);
  await cleanup();

  // erro de sessão (ex.: rede): mostra a mensagem e os detalhes técnicos
  globalThis.fetch = async (u, init) => { if (init?.mode === "no-cors") return json(200, {}); throw new TypeError("Failed to fetch"); };
  await mount(page(fakeAuth({ isAuthenticated: false, accounts: [], currentAccount: null, sessionError: "Não foi possível contactar o servidor." })));
  assert.ok(text().includes("Não foi possível contactar o servidor."));
  await click(find("button", "Ver detalhes técnicos")); await settle();
  assert.match(find("pre").textContent, /CORS: BLOQUEADO.*https:\/\/www\.nexoraforex\.pro/);
});

// =====================================================================
await scenario("CallbackPage: erros com texto fixo e confirmação da sessão", async () => {
  const CallbackPage = (await load("/src/pages/CallbackPage.tsx")).default;
  const page = (url, refresh) => h(MemoryRouter, { initialEntries: [url] }, h(LoaderProvider, null, withAuth(fakeAuth({ refresh }), h(Routes, null, h(Route, { path: "/callback", element: h(CallbackPage) }), h(Route, { path: "/dashboard", element: h("div", null, "DASH", h(Where)) }), h(Route, { path: "/", element: h("div", null, "HOME", h(Where)) })))));

  let calls = 0;
  await mount(page("/callback?error=access_denied", async () => { calls++; return true; })); await settle();
  assert.ok(text().includes("Cancelaste a autorização")); assert.equal(calls, 0, "com erro, não pede a sessão");
  await cleanup();

  const evil = "<img src=x onerror=alert(1)>";
  await mount(page(`/callback?error=${encodeURIComponent(evil)}`, async () => true)); await settle();
  assert.ok(text().includes("Não foi possível concluir o login")); assert.ok(!text().includes("onerror"), "nunca mostra texto vindo do endereço");
  assert.equal(document.body.querySelector("img"), null);
  // tentar de novo volta ao ecrã de entrada
  await click(find("button", "Tentar")); assert.equal(where(), "/");
  await cleanup();

  await mount(page("/callback", async () => true)); await settle();
  assert.equal(where(), "/dashboard");
  await cleanup();

  await mount(page("/callback", async () => false)); await settle();
  assert.ok(text().includes("Não foi possível validar a sessão"));
});

// =====================================================================
await scenario("AuthProvider: sessão por cookie, contas, conta DEMO por omissão e logout", async () => {
  const seen = []; let last;
  const Probe = () => { last = useAuth(); return h("span", { "data-testid": "state" }, `${last.isLoading ? "L" : "-"}|${last.isAuthenticated ? "A" : "-"}|${last.currentAccount?.account_id ?? ""}|${last.sessionError ?? ""}`); };
  const state = () => find('[data-testid="state"]').textContent;
  const render = () => mount(h(AuthProvider, null, h(Probe)));

  // sem sessão (401)
  globalThis.fetch = async (u, init) => { seen.push([u, init]); return json(401, { error: { code: "UNAUTHORIZED", message: "x" } }); };
  await render(); await settle(); assert.equal(state(), "-|-||");
  assert.equal(seen[0][0], "https://api.teste.pro/me/accounts"); assert.equal(seen[0][1].credentials, "include");
  assert.equal(localStorage.getItem("token"), null, "nenhum token no browser");
  await cleanup();

  // com sessão: escolhe a conta DEMO e guarda só o id
  globalThis.fetch = async () => json(200, { live: true, accounts: [{ accountId: "CR1", accountType: "real", currency: "USD", status: "active", balance: 25.5 }, { accountId: "VRTC1", accountType: "demo", currency: "USD", status: "active", balance: 10000 }] });
  await render(); await settle(); assert.equal(state(), "-|A|VRTC1|");
  assert.equal(last.derivLive, true); assert.equal(last.accounts.length, 2); assert.equal(localStorage.getItem("currentAccountId"), "VRTC1");
  // troca de conta
  await act(async () => { await last.setCurrentAccount(last.accounts[0]); });
  assert.equal(state(), "-|A|CR1|"); assert.equal(localStorage.getItem("currentAccountId"), "CR1");
  // sem token da Deriv válido: contas sem saldo, sessão continua
  globalThis.fetch = async () => json(200, { live: false, accounts: [{ accountId: "VRTC1", accountType: "demo", currency: "USD", status: "active", balance: null }] });
  await act(async () => { await last.refreshAccounts(); });
  assert.equal(last.derivLive, false); assert.equal(last.isAuthenticated, true); assert.equal(last.currentAccount.balance, 0);
  // uma falha de rede no refresco NÃO termina a sessão
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await act(async () => { await last.refreshAccounts(); });
  assert.equal(last.isAuthenticated, true);
  // 401 no refresco termina a sessão
  globalThis.fetch = async () => json(401, { error: { code: "UNAUTHORIZED", message: "x" } });
  await act(async () => { await last.refreshAccounts(); });
  assert.equal(last.isAuthenticated, false);
  await cleanup();

  // erro de rede ao verificar: mostra a mensagem
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await render(); await settle(); assert.equal(state(), "-|-||Não foi possível contactar o servidor.");
  await cleanup();

  // logout: pede ao servidor, limpa o id guardado e volta ao início — mesmo que o servidor falhe
  const gone = []; nav.go = (u) => gone.push(u); const reqs = [];
  globalThis.fetch = async (u, init) => { reqs.push([u, init?.method ?? "GET"]); return u.endsWith("/auth/logout") ? json(500, {}) : json(200, { live: true, accounts: [{ accountId: "VRTC1", accountType: "demo", currency: "USD", status: "active", balance: 1 }] }); };
  await render(); await settle();
  await act(async () => { await last.logout(); });
  assert.ok(reqs.some(([u, m]) => u === "https://api.teste.pro/auth/logout" && m === "POST"));
  assert.deepEqual(gone, ["/"]); assert.equal(localStorage.getItem("currentAccountId"), null); assert.equal(last.isAuthenticated, false);
});

// =====================================================================
await scenario("MenuPage: online REAL, sem avisos inventados, links e termos", async () => {
  const MenuPage = (await load("/src/pages/MenuPage.tsx")).default;
  const page = (auth) => h(MemoryRouter, { initialEntries: ["/menu"] }, h(LoaderProvider, null, withAuth(auth, h(Routes, null, h(Route, { path: "/menu", element: h(MenuPage) }), h(Route, { path: "/", element: h("div", null, "HOME", h(Where)) })))));

  globalThis.fetch = async (u) => (u.endsWith("/online-count") ? json(200, { count: 7 }) : json(404, {}));
  await mount(page(fakeAuth())); await settle(50);
  const online = find("span", "ONLINES").closest(".card").textContent;
  assert.match(online, /7/); assert.ok(!text().includes("406"), "o contador simulado desapareceu");
  assert.ok(!text().includes("AVISOS") && !text().includes("Manutenção programada"), "sem avisos inventados");
  const signup = find("a", "CADASTRO NA CORRETORA").href; assert.equal(new URL(signup).searchParams.get("t"), "afiliado_TOKEN_123");
  const support = find("a", "FALAR COM SUPORTE").href; assert.ok(support.startsWith("https://wa.me/244976289984?text="), support);
  await cleanup();

  // servidor em baixo: "—", nunca um número inventado
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await mount(page(fakeAuth())); await settle(50);
  assert.match(find("span", "ONLINES").closest(".card").textContent, /—/);
  await cleanup();

  // sem sessão: volta ao início
  globalThis.fetch = async () => json(401, {});
  await mount(page(fakeAuth({ isAuthenticated: false, accounts: [], currentAccount: null }))); await settle();
  assert.equal(where(), "/");
});

// =====================================================================
await scenario("ControlsSection: contas, estratégia (com descrição), configuração com erros por campo e play", async () => {
  const ControlsSection = (await load("/src/components/ControlsSection.tsx")).ControlsSection;
  const bot = toCatalogBot(OBSERVADOR, RISK_PARAMS);
  const spies = { select: [], save: [], start: [], stop: [], account: [] };
  let saveResults = [];
  const botsValue = (o = {}) => ({
    catalogBots: [bot], isLoadingCatalog: false, sessionBots: [], botStates: {}, wsStatus: "connected", lastError: null, statusMessage: null,
    trades: [], botTrades: {}, openTrades: {}, botLogs: {},
    listCatalogBots() {}, listSessionBots() {}, startCatalogBot: (id) => { spies.start.push(id); return true; }, stopBot: (id) => spies.stop.push(id), pauseBot() {}, resumeBot() {}, deleteBot() {}, getBotLogs() {}, clearTrades() {},
    adminAddCatalogBot() {}, adminRemoveCatalogBot() {}, adminUpdateCatalogBot() {}, manualBuy() {}, manualPendingTrade: null, manualTrades: [], manualBuyError: null,
    selectedBotId: null, savedConfig: null,
    selectBot: async (id) => { spies.select.push(id); }, saveBotConfig: async (id, values) => { spies.save.push([id, values]); return saveResults.shift() ?? { ok: true }; },
    ...o,
  });
  const tree = (bots, auth = fakeAuth({ setCurrentAccount: async (a) => { spies.account.push(a.account_id); } })) =>
    h(MemoryRouter, null, h(LoaderProvider, null, withAuth(auth, h(BotsContext.Provider, { value: bots }, h(ControlsSection)))));

  const m = await mount(tree(botsValue()));
  assert.ok(text().includes("Tipo de Conta") && text().includes("Estratégia"));
  assert.ok(text().includes("DEMO"), "conta ativa: DEMO");
  assert.ok(find("button", "Selecionar"), "sem estratégia escolhida");
  assert.equal(find('[aria-label="Configurar parâmetros"]').disabled, true, "sem estratégia, sem configuração");
  assert.equal(find('[aria-label="Iniciar"]').disabled, true, "sem estratégia, sem play");

  // ---- contas: lista com saldo na moeda certa ----
  await click(find("button", "DEMO"));
  assert.ok(text().includes("Selecionar Tipo de Conta"));
  assert.ok(text().includes("10000.00 USD") && text().includes("25.50 USD"));
  await click(find("button", "REAL")); await settle(); assert.deepEqual(spies.account, ["CR1"]);
  await settle(50);

  // ---- estratégia: descrição (botão ⓘ) e escolha ----
  await click(find("button", "Selecionar"));
  assert.ok(text().includes("Selecionar Estratégia")); assert.ok(text().includes("Acompanha os candles"));
  assert.ok(!text().includes("NÃO abre operações"), "descrição escondida até pedir");
  const info = find('[aria-label="Ver descrição de Observador (demonstração)"]');
  assert.equal(info.getAttribute("aria-expanded"), "false");
  await click(info);
  assert.ok(text().includes("NÃO abre operações")); assert.equal(find('[aria-label="Ver descrição de Observador (demonstração)"]').getAttribute("aria-expanded"), "true");
  await click(info); assert.ok(!text().includes("NÃO abre operações"));
  await click(find("button", "Observador (demonstração)")); await settle(50);
  assert.deepEqual(spies.select, ["observador"]);

  // ---- com a estratégia escolhida: configuração ----
  await m.rerender(tree(botsValue({ selectedBotId: "observador" })));
  assert.ok(find("button", "Observador (demonstração)"));
  const gear = find('[aria-label="Configurar parâmetros"]'); assert.equal(gear.disabled, false);
  await click(gear);
  assert.ok(text().includes("Parâmetros do bot") && text().includes("Limites de risco"));
  for (const label of ["Símbolo", "Duração do candle", "Valor por operação", "Perda máxima por dia", "Operações por dia (máx.)", "Operações abertas ao mesmo tempo (máx.)", "Perdas seguidas até parar", "Espera entre operações (segundos)"]) assert.ok(text().includes(label), label);
  const selects = all("select"); assert.equal(selects.length, 2);
  assert.equal(selects[0].value, "R_100"); assert.equal(selects[1].value, "60");
  const numbers = () => all('input[type="number"]'); assert.equal(numbers().length, 6);
  assert.ok(numbers().every((i) => i.value === ""), "limites de risco começam vazios (nunca com 0 ou valor inventado)");

  // confirmar vazio: o servidor recusa; os erros aparecem por baixo dos campos e a janela fica aberta
  saveResults = [{ ok: false, message: "Configuração inválida.", fieldErrors: { "risk.stake": "Obrigatório.", "risk.maxDailyLoss": "Obrigatório.", "risk.maxTradesPerDay": "Obrigatório." } }];
  await click(find("button", "Confirmar")); await settle();
  assert.deepEqual(spies.save[0], ["observador", { params: { symbol: "R_100", candleSeconds: "60" }, risk: {} }], "nunca envia 0 inventado");
  assert.equal(all('[role="alert"]', "Obrigatório.").length, 3); assert.ok(text().includes("Limites de risco"), "janela continua aberta");

  // preencher e guardar
  await setValue(selects[0], "R_50"); await setValue(all("select")[1], "300");
  const fill = ["1.50", "10", "20", "1", "3", "60"];
  for (let i = 0; i < 6; i++) await setValue(numbers()[i], fill[i]);
  saveResults = [{ ok: true }];
  await click(find("button", "Confirmar")); await settle();
  assert.deepEqual(spies.save[1], ["observador", { params: { symbol: "R_50", candleSeconds: "300" }, risk: { stake: "1.50", maxDailyLoss: "10", maxTradesPerDay: 20, maxOpenPositions: 1, maxConsecutiveLosses: 3, cooldownSeconds: 60 } }]);
  assert.ok(!text().includes("Limites de risco"), "janela fechou depois de guardar");

  // erro geral (ex.: rede): mensagem, janela aberta
  await click(find('[aria-label="Configurar parâmetros"]'));
  saveResults = [{ ok: false, message: "Não foi possível guardar. Tente novamente.", fieldErrors: {} }];
  await click(find("button", "Confirmar")); await settle();
  assert.ok(text().includes("Não foi possível guardar")); await click(find("button", "Cancelar")); assert.ok(!text().includes("Limites de risco"));

  // configuração guardada reaparece preenchida
  const saved = { params: { symbol: "R_50", candleSeconds: "300" }, risk: { stake: "2", maxDailyLoss: "10", maxTradesPerDay: 20, maxOpenPositions: 1, maxConsecutiveLosses: 3, cooldownSeconds: 60 } };
  await m.rerender(tree(botsValue({ selectedBotId: "observador", savedConfig: saved })));
  await click(find('[aria-label="Configurar parâmetros"]'));
  assert.equal(all("select")[0].value, "R_50"); assert.equal(all("select")[1].value, "300"); assert.equal(numbers()[0].value, "2"); assert.equal(numbers()[2].value, "20");
  await click(find("button", "Cancelar"));

  // ---- play ----
  const play = find('[aria-label="Iniciar"]'); assert.equal(play.disabled, false);
  await click(play); assert.deepEqual(spies.start, ["observador"]);
  // sem ligação à Deriv, o play fica desativado
  await m.rerender(tree(botsValue({ selectedBotId: "observador", savedConfig: saved, wsStatus: "disconnected" })));
  assert.equal(find('[aria-label="Iniciar"]').disabled, true);
  // a correr: mostra "Parar"
  await m.rerender(tree(botsValue({ selectedBotId: "observador", savedConfig: saved, sessionBots: [{ id: "local-observador", name: "Observador (demonstração)", strategy: "observador", status: "running", stats: {}, startedAt: new Date().toISOString() }] })));
  const stop = find('[aria-label="Parar"]'); assert.ok(stop); await click(stop); assert.deepEqual(spies.stop, ["local-observador"]);
});

// =====================================================================
await scenario("Painel completo (providers reais): saldo, escolha, configuração, play e parar", async () => {
  const DashboardPage = (await load("/src/pages/DashboardPage.tsx")).default;
  const reqs = [];
  let mine = { selectedBotId: null, config: null };
  globalThis.fetch = async (u, init = {}) => {
    const method = init.method ?? "GET"; const path = u.replace("https://api.teste.pro", ""); reqs.push([method, path, init.body ? JSON.parse(init.body) : undefined]);
    if (path === "/bots") return json(200, { bots: [OBSERVADOR], riskParams: RISK_PARAMS });
    if (path === "/me/bot" && method === "GET") return json(200, mine);
    if (path === "/me/bot/selection") { mine = { selectedBotId: JSON.parse(init.body).botId, config: null }; return json(204); }
    if (path === "/me/bot/config") { const b = JSON.parse(init.body); mine = { selectedBotId: b.botId, config: { params: b.params, risk: b.risk } }; return json(200, { config: mine.config }); }
    return json(404, {});
  };
  const m = await mount(h(MemoryRouter, { initialEntries: ["/dashboard"] }, h(LoaderProvider, null, h(TradingProvider, null, withAuth(fakeAuth(), h(Routes, null, h(Route, { path: "/dashboard", element: h(DashboardPage) }), h(Route, { path: "/", element: h("div", null, "HOME", h(Where)) })))))));
  await settle(80);

  assert.ok(text().includes("10000.00"), "saldo da conta DEMO no cartão");
  assert.ok(text().includes("USD"));
  assert.ok(find("span", "Conectado") || text().includes("Conectado"), "rodapé: Deriv conectado");
  assert.ok(FakeWS.instances.some((s) => s.url === "wss://api.derivws.com/trading/v1/options/ws/public"), "o gráfico liga à WebSocket pública oficial");
  assert.deepEqual(reqs.slice(0, 2).map((r) => r[1]).sort(), ["/bots", "/me/bot"]);

  // escolher estratégia → vai ao servidor e relê o estado
  await click(find("button", "Selecionar")); await click(find("button", "Observador (demonstração)")); await settle(80);
  assert.ok(reqs.some(([mth, p, b]) => mth === "PUT" && p === "/me/bot/selection" && b.botId === "observador"));
  assert.ok(find("button", "Observador (demonstração)"), "a estratégia escolhida aparece");

  // play sem configurar: aviso, nada arranca
  await click(find('[aria-label="Iniciar"]')); await settle();
  assert.ok(text().includes("Falta configurar")); assert.ok(find('[aria-label="Iniciar"]'), "continua parado");

  // configurar
  await click(find('[aria-label="Configurar parâmetros"]'));
  const nums = all('input[type="number"]'); const vals = ["1.50", "10", "20", "1", "3", "60"];
  for (let i = 0; i < 6; i++) await setValue(nums[i], vals[i]);
  await click(find("button", "Confirmar")); await settle(80);
  const put = reqs.find(([mth, p]) => mth === "PUT" && p === "/me/bot/config");
  assert.deepEqual(put[2], { botId: "observador", params: { symbol: "R_100", candleSeconds: "60" }, risk: { stake: "1.50", maxDailyLoss: "10", maxTradesPerDay: 20, maxOpenPositions: 1, maxConsecutiveLosses: 3, cooldownSeconds: 60 } });
  assert.ok(!text().includes("Limites de risco"), "janela fechou");

  // play: o Observador fica ativo, com a mensagem honesta
  await click(find('[aria-label="Iniciar"]')); await settle();
  assert.ok(text().includes("Observador (demonstração) ativo")); assert.ok(text().includes("não abre operações"));
  assert.ok(find('[aria-label="Parar"]'), "agora mostra Parar");
  // parar
  await click(find('[aria-label="Parar"]')); await settle();
  assert.ok(find('[aria-label="Iniciar"]'));
});

// =====================================================================
await scenario("App: rotas, redirecionamento sem sessão e funcionalidades sem servidor", async () => {
  const App = (await load("/src/App.tsx")).default;
  globalThis.fetch = async () => json(401, { error: { code: "UNAUTHORIZED", message: "x" } });

  window.history.pushState({}, "", "/");
  await mount(h(App)); await settle(50);
  assert.ok(find("button", "Entrar com a Deriv"), "ecrã de entrada");
  await cleanup();

  window.history.pushState({}, "", "/dashboard");
  await mount(h(App)); await settle(80);
  assert.ok(find("button", "Entrar com a Deriv"), "sem sessão, o painel redireciona para a entrada");
  await cleanup();

  for (const [path, title] of [["/admin", "Painel de administração"], ["/operar-manual", "Operar manualmente"]]) {
    window.history.pushState({}, "", path);
    await mount(h(App)); await settle(50);
    assert.ok(text().includes(title) && text().includes("ainda não está disponível"), path);
    await cleanup();
  }
  // rota desconhecida
  window.history.pushState({}, "", "/nao-existe");
  await mount(h(App)); await settle(50);
  assert.ok(find("button", "Entrar com a Deriv") || text().includes("NEXORA"), "rota desconhecida não rebenta");
});

await L.close();
console.log(`OK: interface (${results.length} cenários): ${results.join(" | ")}`);
process.exit(0);
