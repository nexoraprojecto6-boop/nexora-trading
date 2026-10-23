import assert from "node:assert/strict";
import { RiskManager } from "../dist/index.js";

const LIMITS = { maxStakeMinor: 1000, maxDailyLossMinor: 3000, maxTradesPerDay: 5, maxOpenPositions: 2, maxConsecutiveLosses: 3, cooldownSeconds: 60 };
const DAY = 86400;
const D0 = 10 * DAY;                         // início de um dia UTC
const intent = (stakeMinor = 500) => ({ symbol: "R_100", direction: "up", stakeMinor, currency: "USD", createdAtEpoch: 0, strategy: "t", reason: "r" });
const mk = (over = {}) => RiskManager.create({ ...LIMITS, ...over }).value;
const reason = (rm, i, now) => { const d = rm.evaluate(i, now); return d.approved ? "ok" : d.reason; };

// ---- criação: todos os limites obrigatórios e positivos ----
for (const key of ["maxStakeMinor", "maxDailyLossMinor", "maxTradesPerDay", "maxOpenPositions", "maxConsecutiveLosses"]) {
  for (const bad of [0, -1, 1.5, NaN, undefined, Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(RiskManager.create({ ...LIMITS, [key]: bad }).ok, false, `${key}=${bad}`);
  }
}
assert.equal(RiskManager.create({ ...LIMITS, cooldownSeconds: -1 }).ok, false);
assert.equal(RiskManager.create({ ...LIMITS, cooldownSeconds: 0 }).ok, true);
const { maxStakeMinor: _omit, ...semStake } = LIMITS; assert.equal(RiskManager.create(semStake).ok, false);

// ---- aprovações e rejeições básicas ----
let rm = mk();
assert.equal(reason(rm, intent(500), D0), "ok");
assert.equal(reason(rm, intent(1001), D0), "stake_exceeds_limit");
for (const bad of [0, -5, 2.5, NaN]) assert.equal(reason(rm, intent(bad), D0), "stake_invalid");

// ---- pior caso diário inclui posições abertas (limite diário 3000) ----
rm = mk({ cooldownSeconds: 0, maxOpenPositions: 10, maxStakeMinor: 5000 });
rm.recordOpened(1000, D0); rm.recordOpened(1000, D0);                 // 2000 em risco
assert.equal(reason(rm, intent(1000), D0), "ok");                     // 2000 + 1000 = 3000: dentro do limite
assert.equal(reason(rm, intent(1001), D0), "daily_loss_limit");       // 3001 > 3000
rm.recordClosed(1000, -1000, D0);                                     // perde 1000: PnL -1000, em risco 1000
assert.equal(reason(rm, intent(1000), D0), "ok");                     // 1000 + 1000 + 1000 = 3000
assert.equal(reason(rm, intent(1001), D0), "daily_loss_limit");
rm.recordClosed(1000, 1800, D0);                                      // ganha 1800: PnL +800, nada em risco
assert.equal(reason(rm, intent(3000), D0), "ok");                     // lucro não aumenta o limite de perda
assert.equal(reason(rm, intent(3001), D0), "daily_loss_limit");

// ---- limite de operações por dia ----
rm = mk({ cooldownSeconds: 0, maxOpenPositions: 100, maxTradesPerDay: 3, maxDailyLossMinor: 1_000_000 });
for (let i = 0; i < 3; i++) { assert.equal(reason(rm, intent(1), D0 + i), "ok"); rm.recordOpened(1, D0 + i); rm.recordClosed(1, 1, D0 + i); }
assert.equal(reason(rm, intent(1), D0 + 10), "daily_trade_limit");

// ---- novo dia UTC repõe contadores do dia, mas não a paragem nem posições abertas ----
assert.equal(reason(rm, intent(1), D0 + DAY), "ok");
rm = mk({ cooldownSeconds: 0, maxOpenPositions: 1 });
rm.recordOpened(500, D0);
assert.equal(reason(rm, intent(500), D0 + DAY + 5), "max_open_positions");   // a posição continua aberta no dia seguinte
rm = mk({ cooldownSeconds: 0 }); rm.halt("manual");
assert.equal(reason(rm, intent(1), D0 + DAY * 3), "halted");

// ---- posições abertas ----
rm = mk({ cooldownSeconds: 0, maxOpenPositions: 2 });
rm.recordOpened(100, D0); rm.recordOpened(100, D0);
assert.equal(reason(rm, intent(100), D0 + 1), "max_open_positions");
rm.recordClosed(100, 50, D0 + 2);
assert.equal(reason(rm, intent(100), D0 + 3), "ok");
rm.recordClosed(100, 50, D0 + 4); rm.recordClosed(100, 50, D0 + 4); // fecho a mais nunca fica negativo
assert.equal(rm.snapshot().openPositions, 0); assert.equal(rm.snapshot().openStakeMinor, 0);

// ---- cooldown ----
rm = mk({ cooldownSeconds: 60 });
assert.equal(reason(rm, intent(100), D0), "ok");
rm.recordOpened(100, D0);
assert.equal(reason(rm, intent(100), D0 + 59), "cooldown");
assert.equal(reason(rm, intent(100), D0 + 60), "ok");

// ---- perdas seguidas → paragem até resume() ----
rm = mk({ cooldownSeconds: 0, maxOpenPositions: 10, maxConsecutiveLosses: 3, maxDailyLossMinor: 1_000_000 });
for (let i = 0; i < 2; i++) { rm.recordOpened(10, D0); rm.recordClosed(10, -10, D0); }
assert.equal(rm.halted, false);
rm.recordOpened(10, D0); rm.recordClosed(10, 5, D0);                  // um ganho zera a sequência
assert.equal(rm.snapshot().consecutiveLosses, 0);
for (let i = 0; i < 3; i++) { rm.recordOpened(10, D0); rm.recordClosed(10, -10, D0); }
assert.equal(rm.halted, true); assert.equal(rm.snapshot().haltReason, "consecutive_losses");
assert.equal(reason(rm, intent(10), D0 + DAY), "halted");             // nem no dia seguinte
rm.resume(); assert.equal(rm.halted, false); assert.equal(rm.snapshot().consecutiveLosses, 0);
assert.equal(reason(rm, intent(10), D0 + DAY), "ok");

// ---- interruptor de emergência: a primeira razão fica registada ----
rm = mk(); rm.halt("a"); rm.halt("b"); assert.equal(rm.snapshot().haltReason, "a");

// ---- os limites criados não mudam se o objeto original for alterado ----
const lim = { ...LIMITS }; rm = RiskManager.create(lim).value; lim.maxStakeMinor = 10 ** 9;
assert.equal(reason(rm, intent(1001), D0), "stake_exceeds_limit");
console.log("OK: gestão de risco");
