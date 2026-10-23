import assert from "node:assert/strict";
import { BotRunner, CandleAggregator, RiskManager } from "../dist/index.js";

const LIMITS = { maxStakeMinor: 1000, maxDailyLossMinor: 5000, maxTradesPerDay: 100, maxOpenPositions: 1, maxConsecutiveLosses: 5, cooldownSeconds: 0 };
const D0 = 20 * 86400;
const tick = (epoch, quote) => ({ symbol: "R_100", epoch, quote });
function setup({ strategy, stakeMinor = 500, limits = {} } = {}) {
  const aggregator = CandleAggregator.create("R_100", 60).value;
  const risk = RiskManager.create({ ...LIMITS, ...limits }).value;
  const runner = BotRunner.create({ currency: "USD", stakeMinor, strategy, aggregator, risk });
  return { runner: runner.value, risk, created: runner };
}
// Estratégia de teste (não é uma estratégia de trading): "up" se o candle subiu, senão "down".
const testStrategy = { name: "teste", onCandle: (c) => ({ direction: c.close >= c.open ? "up" : "down", reason: `open=${c.open} close=${c.close}` }) };

// criação inválida
assert.equal(setup({ strategy: testStrategy, stakeMinor: 0 }).created.ok, false);
assert.equal(setup({ strategy: testStrategy, stakeMinor: 1.5 }).created.ok, false);

// fluxo: só há eventos quando um candle fecha
let { runner, risk } = setup({ strategy: testStrategy });
assert.deepEqual(runner.onTick(tick(D0, 10)), []);
assert.deepEqual(runner.onTick(tick(D0 + 30, 12)), []);
let ev = runner.onTick(tick(D0 + 60, 11));
assert.deepEqual(ev.map((e) => e.type), ["candle", "signal", "intent"]);
assert.equal(ev[0].candle.close, 12);
const intent = ev[2].intent;
assert.deepEqual(ev[2].decision, { approved: true });
assert.deepEqual(intent, { symbol: "R_100", direction: "up", stakeMinor: 500, currency: "USD", createdAtEpoch: D0 + 60, strategy: "teste", reason: "open=10 close=12" });

// o runner não executa nem regista nada sozinho: sem recordOpened, o risco não muda
assert.equal(risk.snapshot().tradesToday, 0);
// com uma posição aberta (limite 1), a intenção seguinte é rejeitada
risk.recordOpened(500, D0 + 60);
ev = runner.onTick(tick(D0 + 120, 5));
assert.deepEqual(ev.find((e) => e.type === "intent").decision, { approved: false, reason: "max_open_positions" });

// stake acima do limite é rejeitado pelo risco, nunca por truncagem
({ runner } = setup({ strategy: testStrategy, stakeMinor: 5000 }));
runner.onTick(tick(D0, 1)); ev = runner.onTick(tick(D0 + 60, 1));
assert.deepEqual(ev.find((e) => e.type === "intent").decision, { approved: false, reason: "stake_exceeds_limit" });

// sem sinal → só o candle
({ runner } = setup({ strategy: { name: "nada", onCandle: () => undefined } }));
runner.onTick(tick(D0, 1)); assert.deepEqual(runner.onTick(tick(D0 + 60, 1)).map((e) => e.type), ["candle"]);

// falha segura: exceção da estratégia pára o robô e não deixa passar nada
let calls = 0;
({ runner, risk } = setup({ strategy: { name: "avaria", onCandle: () => { calls++; throw new TypeError("detalhe interno SEGREDO"); } } }));
runner.onTick(tick(D0, 1)); ev = runner.onTick(tick(D0 + 60, 1));
assert.deepEqual(ev.map((e) => e.type), ["candle", "strategy_error"]);
assert.ok(!JSON.stringify(ev).includes("SEGREDO"));              // só o nome do erro
assert.equal(risk.halted, true); assert.equal(risk.snapshot().haltReason, "strategy_error");
ev = runner.onTick(tick(D0 + 120, 1));                           // parado: candle sim, estratégia não é chamada
assert.deepEqual(ev.map((e) => e.type), ["candle"]); assert.equal(calls, 1);

// determinismo: a mesma sequência de ticks dá os mesmos eventos
const run = () => { const { runner } = setup({ strategy: testStrategy }); const out = []; for (let i = 0; i < 300; i++) out.push(...runner.onTick(tick(D0 + i * 7, 100 + ((i * 37) % 11)))); return JSON.stringify(out); };
assert.equal(run(), run());
console.log("OK: runner");
