import assert from "node:assert/strict";
import { BOT_CATALOG, RISK_PARAMS, decimalToMinorUnits, findBot, normalizeDecimal, validateBotConfig, validateParams } from "../dist/index.js";

// ---- decimais exatos ----
assert.equal(decimalToMinorUnits("12.50", 2).value, 1250);
assert.equal(decimalToMinorUnits("0.1", 2).value, 10);
assert.equal(decimalToMinorUnits("19.99", 2).value, 1999);
assert.equal(decimalToMinorUnits("0.00000001", 8).value, 1);
assert.equal(decimalToMinorUnits("1.001", 2).ok, false);          // mais casas que a moeda
for (const bad of ["", "-1", "1e3", "1,5", ".5", "5.", " 5", "1.123456789", "1234567890123"]) assert.equal(decimalToMinorUnits(bad, 8).ok, false, bad);
assert.equal(decimalToMinorUnits("999999999999.99999999", 8).ok, false);   // fora do intervalo seguro
assert.equal(normalizeDecimal("007.500"), "7.5"); assert.equal(normalizeDecimal("10.00"), "10"); assert.equal(normalizeDecimal("0.10"), "0.1");

// ---- catálogo ----
assert.ok(BOT_CATALOG.length >= 1);
const ids = new Set();
for (const bot of BOT_CATALOG) {
  assert.match(bot.id, /^[a-z0-9-]{3,40}$/); assert.ok(!ids.has(bot.id), "ids únicos"); ids.add(bot.id);
  assert.ok(bot.name && bot.summary && bot.description);
  const keys = bot.params.map((p) => p.key); assert.equal(new Set(keys).size, keys.length);
  for (const p of bot.params) assert.ok(!RISK_PARAMS.some((r) => r.key === p.key), "sem colisão com limites de risco");
  // os padrões de cada bot têm de ser válidos
  const defaults = Object.fromEntries(bot.params.filter((p) => p.default !== undefined).map((p) => [p.key, p.default]));
  assert.ok(validateParams(bot.params, defaults).ok, `padrões inválidos em ${bot.id}`);
}
assert.equal(findBot("over-3").id, "over-3"); assert.equal(findBot("nao-existe"), undefined); assert.equal(findBot("__proto__"), undefined);
// nenhum limite de risco tem valor por omissão
for (const r of RISK_PARAMS) assert.equal(r.default, undefined, r.key);

// ---- validação de parâmetros ----
// Bot de teste com 2 parâmetros e os limites gerais (o catálogo real usa limites próprios).
const bot = { id: "teste", name: "t", summary: "t", description: "t", params: [
  { kind: "symbol", key: "symbol", label: "Símbolo", default: "R_100" },
  { kind: "select", key: "candleSeconds", label: "Candle", options: [{ value: "60", label: "1 min" }, { value: "120", label: "2 min" }, { value: "300", label: "5 min" }], default: "60" },
] };
const risk = { stake: "1.50", maxDailyLoss: "10", maxTradesPerDay: 20, maxOpenPositions: 1, maxConsecutiveLosses: 3, cooldownSeconds: 60 };
let r = validateBotConfig(bot, { params: {}, risk });                 // usa os padrões do bot
assert.ok(r.ok, JSON.stringify(r.error)); assert.deepEqual(r.value.params, { symbol: "R_100", candleSeconds: "60" });
assert.deepEqual(r.value.risk, { stake: "1.5", maxDailyLoss: "10", maxTradesPerDay: 20, maxOpenPositions: 1, maxConsecutiveLosses: 3, cooldownSeconds: 60 });
r = validateBotConfig(bot, { params: { symbol: "R_50", candleSeconds: "300" }, risk: { ...risk, maxTradesPerDay: "20", stake: 1.5 } });
assert.ok(r.ok); assert.equal(r.value.params.symbol, "R_50"); assert.equal(r.value.risk.maxTradesPerDay, 20); assert.equal(r.value.risk.stake, "1.5");

const errs = (input) => { const x = validateBotConfig(bot, input); assert.equal(x.ok, false); return x.error.details.errors; };
// limites de risco são obrigatórios
assert.equal(errs({ params: {}, risk: {} })["risk.stake"], "Obrigatório.");
assert.equal(errs({ params: {} })["risk.*"], "Valores em falta.");
assert.equal(errs({ params: {}, risk: { ...risk, stake: "" } })["risk.stake"], "Obrigatório.");   // vazio ≠ válido
// limites e tipos
assert.match(errs({ params: {}, risk: { ...risk, stake: "0" } })["risk.stake"], /entre/);
assert.match(errs({ params: {}, risk: { ...risk, stake: "100001" } })["risk.stake"], /entre/);
assert.match(errs({ params: {}, risk: { ...risk, stake: "1,5" } })["risk.stake"], /inválido/);
assert.match(errs({ params: {}, risk: { ...risk, stake: "1e2" } })["risk.stake"], /inválido/);
assert.match(errs({ params: {}, risk: { ...risk, stake: 1e-7 } })["risk.stake"], /inválido/);
assert.match(errs({ params: {}, risk: { ...risk, maxTradesPerDay: 0 } })["risk.maxTradesPerDay"], /entre/);
assert.match(errs({ params: {}, risk: { ...risk, maxTradesPerDay: 2.5 } })["risk.maxTradesPerDay"], /inteiro/);
assert.match(errs({ params: {}, risk: { ...risk, maxOpenPositions: 11 } })["risk.maxOpenPositions"], /entre/);
assert.match(errs({ params: {}, risk: { ...risk, cooldownSeconds: -1 } })["risk.cooldownSeconds"], /entre/);
assert.match(errs({ params: {}, risk: { ...risk, maxDailyLoss: "1" } })["risk.maxDailyLoss"], /igual ou superior/);   // < stake
assert.ok(validateBotConfig(bot, { params: {}, risk: { ...risk, maxDailyLoss: "1.5" } }).ok);                          // = stake
// parâmetros do bot
assert.match(errs({ params: { symbol: "R 100" }, risk })["params.symbol"], /inválido/);
assert.match(errs({ params: { symbol: "x".repeat(33) }, risk })["params.symbol"], /inválido/);
assert.match(errs({ params: { candleSeconds: "61" }, risk })["params.candleSeconds"], /opções/);
assert.match(errs({ params: { candleSeconds: 60 }, risk })["params.candleSeconds"], /opções/);
// chaves desconhecidas são recusadas (nada de campos escondidos)
assert.equal(errs({ params: { extra: 1 }, risk })["params.extra"], "Parâmetro desconhecido.");
assert.equal(errs({ params: {}, risk: { ...risk, token: "x" } })["risk.token"], "Parâmetro desconhecido.");
assert.equal(errs({ params: {}, risk: { ...risk, __proto__x: 1 } })["risk.__proto__x"], "Parâmetro desconhecido.");
// entradas que não são objetos
for (const bad of [null, undefined, 5, "x", []]) assert.equal(validateBotConfig(bot, bad).ok, false);
assert.equal(validateBotConfig(bot, { params: [], risk }).ok, false);
// vários erros de uma vez
assert.ok(Object.keys(errs({ params: { symbol: "!" }, risk: { ...risk, stake: "0", maxTradesPerDay: 0 } })).length >= 3);
// a validação não altera o objeto original
const original = { params: {}, risk: { ...risk } }; const copy = JSON.stringify(original); validateBotConfig(bot, original); assert.equal(JSON.stringify(original), copy);
// bots de dígitos: só 3 limites (stake, take profit, stop loss)
const dig = findBot("even-odd");
assert.ok(validateBotConfig(dig, { params: {}, risk: { stake: "1", takeProfit: "10", stopLoss: "20" } }).ok);
assert.equal(validateBotConfig(dig, { params: {}, risk: { stake: "1", takeProfit: "10" } }).ok, false);
assert.equal(validateBotConfig(dig, { params: {}, risk: { stake: "5", takeProfit: "10", stopLoss: "2" } }).ok, false);
console.log("OK: catálogo e validação");
