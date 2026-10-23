import assert from "node:assert/strict";
import { CandleAggregator, fromMinorUnits, toMinorUnits } from "../dist/index.js";

// ---- dinheiro ----
assert.equal(toMinorUnits(10, 2).value, 1000);
assert.equal(toMinorUnits(0.1 + 0.2, 2).value, 30);                  // erro de vírgula flutuante
assert.equal(toMinorUnits(19.99, 2).value, 1999);
assert.equal(toMinorUnits(0.00000001, 8).value, 1);
assert.equal(toMinorUnits(0.001, 2).ok, false);                      // mais casas do que a moeda
assert.equal(toMinorUnits(NaN, 2).ok, false);
assert.equal(toMinorUnits(Infinity, 2).ok, false);
assert.equal(toMinorUnits(1, 9).ok, false);
assert.equal(toMinorUnits(1, -1).ok, false);
assert.equal(toMinorUnits(1e20, 2).ok, false);                       // fora do intervalo seguro
assert.equal(fromMinorUnits(1999, 2), 19.99);

// ---- candles ----
assert.equal(CandleAggregator.create("", 60).ok, false);
assert.equal(CandleAggregator.create("R_100", 0).ok, false);
assert.equal(CandleAggregator.create("R_100", 1.5).ok, false);
const agg = CandleAggregator.create("R_100", 60).value;
const t = (epoch, quote, symbol = "R_100") => ({ symbol, epoch, quote });

assert.equal(agg.push(t(120, 10)), undefined);
assert.equal(agg.push(t(130, 12)), undefined);
assert.equal(agg.push(t(150, 9)), undefined);
assert.equal(agg.push(t(179, 11)), undefined);
assert.equal(agg.push(t(125, 999)), undefined);                      // atrasado mas no mesmo intervalo: conta
let closed = agg.push(t(180, 20));                                   // abre novo intervalo → fecha o anterior
assert.deepEqual(closed, { symbol: "R_100", openEpoch: 120, open: 10, high: 999, low: 9, close: 999, tickCount: 5 });

// ticks ignorados: outro símbolo, intervalo já fechado, valores inválidos
assert.equal(agg.push(t(190, 1, "R_50")), undefined);
assert.equal(agg.push(t(100, 1)), undefined);
assert.equal(agg.push(t(Number.NaN, 1)), undefined);
assert.equal(agg.push(t(200, Number.POSITIVE_INFINITY)), undefined);
assert.equal(agg.push(t(-5, 1)), undefined);
// intervalos sem ticks não geram candles: salta de 180 para 600
closed = agg.push(t(600, 30));
assert.deepEqual(closed, { symbol: "R_100", openEpoch: 180, open: 20, high: 20, low: 20, close: 20, tickCount: 1 });
// o candle devolvido não muda com ticks posteriores
agg.push(t(601, 31)); assert.equal(closed.close, 20);
console.log("OK: dinheiro e candles");
