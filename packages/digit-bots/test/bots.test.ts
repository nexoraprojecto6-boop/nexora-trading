import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DigitBot } from '../src/bot.js';
import { DerivApiError } from '../src/errors.js';
import { buildBotConfig, PRESETS } from '../src/presets.js';
import { BotManager } from '../src/manager.js';
import type { TradeRecord } from '../src/types.js';
import { FakeSession, noLimit } from './helpers.js';

const make = (id: string, outcomes: ('won' | 'lost')[], over = {}, ratio = 1.1) => {
  const session = new FakeSession(outcomes, ratio);
  const trades: TradeRecord[] = [];
  const bot = new DigitBot(buildBotConfig(id, over), {
    session,
    limiter: noLimit,
    onTrade: (t) => trades.push(t),
    sleep: async () => {},
  });
  return { session, bot, trades };
};

describe('presets e parâmetros de compra', () => {
  const expected: Record<string, { contract_type: string; barrier?: string }> = {
    'digit-3': { contract_type: 'DIGITDIFF', barrier: '3' },
    'digit-1': { contract_type: 'DIGITDIFF', barrier: '1' },
    'over-5': { contract_type: 'DIGITOVER', barrier: '5' },
    'under-8': { contract_type: 'DIGITUNDER', barrier: '8' },
    even: { contract_type: 'DIGITEVEN' },
    odd: { contract_type: 'DIGITODD' },
  };

  for (const p of PRESETS) {
    it(`${p.id} envia buy:1 com parâmetros corretos de 1 tick`, async () => {
      const { session, bot } = make(p.id, ['won'], { maxTrades: 1 });
      await bot.start();
      const buy = session.sent.find((m) => m.buy === 1);
      assert.ok(buy, 'enviou compra');
      assert.equal(buy.price, 1);
      assert.equal(buy.subscribe, 1);
      const e = expected[p.id]!;
      assert.equal(buy.parameters.contract_type, e.contract_type);
      assert.equal(buy.parameters.barrier, e.barrier);
      assert.equal(buy.parameters.duration, 1);
      assert.equal(buy.parameters.duration_unit, 't');
      assert.equal(buy.parameters.basis, 'stake');
      assert.equal(buy.parameters.underlying_symbol, 'R_100');
      assert.equal(buy.parameters.currency, 'USD');
    });
  }

  it('Even/Odd não enviam barrier', () => {
    assert.equal('barrier' in buildBotConfig('even'), false);
  });

  it('rejeita barreiras inválidas', () => {
    assert.throws(() => buildBotConfig('over-5', { barrier: 9 }));
    assert.throws(() => buildBotConfig('under-8', { barrier: 0 }));
    assert.throws(() => buildBotConfig('digit-3', { barrier: 10 }));
    assert.throws(() => buildBotConfig('even', { stake: 0 }));
    assert.throws(() => buildBotConfig('nao-existe'));
  });

  it('permite trocar Differs por Matches', () => {
    const c = buildBotConfig('digit-3', { contractType: 'DIGITMATCH' });
    assert.equal(c.contractType, 'DIGITMATCH');
    assert.equal(c.barrier, 3);
  });
});

describe('comportamento do bot', () => {
  it('compra imediatamente ao iniciar e encadeia a seguinte sem pausa', async () => {
    const { session, bot, trades } = make('over-5', ['won', 'won', 'won'], { maxTrades: 3, takeProfit: 0 });
    await bot.start();
    assert.equal(session.sent.filter((m) => m.buy === 1).length, 3);
    assert.equal(trades.length, 3);
    assert.equal(bot.stats().stopReason, 'max_trades');
  });

  it('contabiliza vitórias, derrotas e lucro', async () => {
    const { bot } = make('even', ['won', 'lost', 'won'], { maxTrades: 3, stopLoss: 0, takeProfit: 0 });
    await bot.start();
    const s = bot.stats();
    assert.equal(s.trades, 3);
    assert.equal(s.wins, 2);
    assert.equal(s.losses, 1);
    assert.equal(s.profit, 0.1 + -1 + 0.1);
    assert.ok(s.avgLatencyMs !== null);
  });

  it('para no stop loss', async () => {
    const { bot, trades } = make('odd', ['lost'], { stopLoss: 3, maxConsecutiveLosses: 0 });
    await bot.start();
    assert.equal(trades.length, 3);
    assert.equal(bot.stats().stopReason, 'stop_loss');
  });

  it('para no take profit', async () => {
    const { bot, trades } = make('odd', ['won'], { takeProfit: 0.25 });
    await bot.start();
    assert.equal(trades.length, 3);
    assert.equal(bot.stats().stopReason, 'take_profit');
  });

  it('para após perdas seguidas', async () => {
    const { bot, trades } = make('odd', ['lost'], { maxConsecutiveLosses: 2, stopLoss: 0 });
    await bot.start();
    assert.equal(trades.length, 2);
    assert.equal(bot.stats().stopReason, 'max_consecutive_losses');
  });

  it('martingale desligado por padrão e com teto quando ligado', async () => {
    const off = make('odd', ['lost'], { maxTrades: 3, stopLoss: 0, maxConsecutiveLosses: 0 });
    await off.bot.start();
    assert.deepEqual(off.trades.map((t) => t.stake), [1, 1, 1]);

    const on = make('odd', ['lost'], {
      maxTrades: 5,
      stopLoss: 0,
      maxConsecutiveLosses: 0,
      stakeMultiplierOnLoss: 2,
      maxStake: 4,
    });
    await on.bot.start();
    assert.deepEqual(on.trades.map((t) => t.stake), [1, 2, 4, 1, 2]);
  });

  it('volta ao stake base depois de ganhar', async () => {
    const { trades, bot } = make('odd', ['lost', 'won', 'lost'], {
      maxTrades: 3,
      stopLoss: 0,
      takeProfit: 0,
      stakeMultiplierOnLoss: 2,
    });
    await bot.start();
    assert.deepEqual(trades.map((t) => t.stake), [1, 2, 1]);
  });

  it('para com saldo insuficiente (resposta da API)', async () => {
    const { session, bot } = make('odd', ['won']);
    session.failBuyWith = new DerivApiError('InsufficientBalance', 'sem saldo', 'buy');
    await bot.start();
    assert.equal(bot.stats().stopReason, 'insufficient_balance');
  });

  it('para em erro de validação sem repetir a compra', async () => {
    const { session, bot } = make('odd', ['won']);
    session.failBuyWith = new DerivApiError('InputValidationFailed', 'parâmetro inválido', 'buy');
    await bot.start();
    assert.equal(bot.stats().stopReason, 'error');
    assert.equal(session.sent.filter((m) => m.buy === 1).length, 1);
  });

  it('para após 5 erros de ligação seguidos', async () => {
    const { session, bot } = make('odd', ['won']);
    session.failBuyWith = new Error('Timeout');
    await bot.start();
    assert.equal(bot.stats().stopReason, 'error');
    assert.equal(session.sent.filter((m) => m.buy === 1).length, 5);
  });

  it('stop manual interrompe o ciclo', async () => {
    const { bot } = make('odd', ['won'], { takeProfit: 0, stopLoss: 0 });
    const p = bot.start();
    await bot.stop();
    await p;
    assert.equal(bot.stats().status, 'stopped');
    assert.equal(bot.stats().stopReason, 'manual');
  });
});

describe('BotManager', () => {
  it('inicia e para vários bots e lista o estado dos 6', async () => {
    const session = new FakeSession(['won']);
    const manager = new BotManager({ session, limiter: noLimit });
    assert.equal(manager.status().length, 6);
    manager.startMany(['over-5', 'under-8'], { maxTrades: 2, takeProfit: 0 });
    await new Promise((r) => setTimeout(r, 20));
    const st = Object.fromEntries(manager.status().map((s) => [s.botId, s]));
    assert.equal(st['over-5']!.trades, 2);
    assert.equal(st['under-8']!.trades, 2);
    assert.equal(st['even']!.status, 'idle');
    await manager.stopAll();
  });
});
