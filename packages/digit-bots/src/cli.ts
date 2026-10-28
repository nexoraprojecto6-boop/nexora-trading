#!/usr/bin/env node
import { loadEnvConfig } from './config.js';
import { BotManager } from './manager.js';
import { PRESETS } from './presets.js';
import { DerivSession } from './session.js';
import type { BotConfig, TradeRecord } from './types.js';

function usage(): never {
  console.log(`Uso:
  nexora-digit-bots list
  nexora-digit-bots run <bot...|all> [--stake 1] [--stop-loss 20] [--take-profit 10]
                                      [--max-losses 5] [--max-trades 0] [--symbol R_100]

Bots: ${PRESETS.map((p) => p.id).join(', ')}
Variáveis: DERIV_TOKEN, DERIV_APP_ID, DERIV_ACCOUNT_TYPE (demo|real), DERIV_ALLOW_REAL, BOT_SYMBOL`);
  process.exit(1);
}

function parseArgs(argv: string[]): { ids: string[]; overrides: Partial<BotConfig> } {
  const ids: string[] = [];
  const o: Partial<BotConfig> = {};
  const numArg = (name: string, v: string | undefined): number => {
    const n = Number(v);
    if (v === undefined || Number.isNaN(n)) throw new Error(`Valor inválido para ${name}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--stake': o.stake = numArg(a, argv[++i]); break;
      case '--stop-loss': o.stopLoss = numArg(a, argv[++i]); break;
      case '--take-profit': o.takeProfit = numArg(a, argv[++i]); break;
      case '--max-losses': o.maxConsecutiveLosses = numArg(a, argv[++i]); break;
      case '--max-trades': o.maxTrades = numArg(a, argv[++i]); break;
      case '--symbol': o.symbol = argv[++i]; break;
      default:
        if (a.startsWith('--')) throw new Error(`Opção desconhecida: ${a}`);
        ids.push(a);
    }
  }
  return { ids: ids.includes('all') ? PRESETS.map((p) => p.id) : ids, overrides: o };
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'list') {
    for (const p of PRESETS) console.log(`${p.id.padEnd(8)} ${p.label}`);
    return;
  }
  if (cmd !== 'run') usage();

  const { ids, overrides } = parseArgs(rest);
  if (ids.length === 0) usage();

  const cfg = loadEnvConfig();
  const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
  const session = new DerivSession({ ...cfg, log });
  const manager = new BotManager({
    session,
    defaults: { symbol: cfg.symbol },
    log,
  });

  manager.on('trade', (t: TradeRecord) => {
    log(
      `${t.botId.padEnd(8)} ${t.won ? 'WIN ' : 'LOSS'} ${t.profit >= 0 ? '+' : ''}${t.profit.toFixed(2)} ` +
        `stake=${t.stake} compra=${t.latencyMs}ms total=${t.settledMs}ms saldo=${t.balanceAfter ?? '?'}`,
    );
  });
  manager.on('stop', (s) => {
    log(`${s.botId} PAROU (${s.stopReason}) trades=${s.trades} lucro=${s.profit}`);
    if (manager.status().every((b) => b.status !== 'running')) void shutdown();
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await manager.stopAll();
    for (const s of manager.status().filter((x) => x.trades > 0)) {
      console.log(
        `${s.botId.padEnd(8)} trades=${s.trades} wins=${s.wins} winRate=${(s.winRate * 100).toFixed(1)}% ` +
          `lucro=${s.profit.toFixed(2)} latMédia=${s.avgLatencyMs ?? '-'}ms`,
      );
    }
    session.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  log(`A ligar (${cfg.accountType})...`);
  await manager.warmUp();
  log(`Ligado. A iniciar: ${ids.join(', ')}`);
  manager.startMany(ids, overrides);
}

main().catch((e) => {
  console.error(`Erro: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
