import { EventEmitter } from 'node:events';
import { DigitBot } from './bot.js';
import type { TickFeed } from './feed.js';
import { buildBotConfig, PRESETS } from './presets.js';
import { RateLimiter } from './rate-limiter.js';
import type { BotConfig, BotStats, Limiter, TradeRecord, TradingSession } from './types.js';

export interface ManagerOptions {
  session: TradingSession;
  /** Limitador partilhado por todos os bots (a Deriv conta por ligação). */
  limiter?: Limiter;
  /** Overrides aplicados a todos os bots (ex.: { symbol: 'R_50', stake: 0.5 }). */
  defaults?: Partial<BotConfig>;
  /** Fluxo de ticks (e estatística dos últimos dígitos) de um símbolo. */
  feeds?: (symbol: string) => TickFeed | undefined;
  log?: (msg: string) => void;
}

/**
 * Gere os 6 bots: pré-aquece a ligação (para o "play" entrar sem esperar),
 * liga/desliga bots individualmente e emite eventos 'trade', 'stop' e 'log'.
 */
export class BotManager extends EventEmitter {
  private bots = new Map<string, DigitBot>();
  private readonly limiter: Limiter;

  constructor(private readonly opts: ManagerOptions) {
    super();
    this.limiter = opts.limiter ?? new RateLimiter();
  }

  /** Abre a ligação já, antes do utilizador carregar em play. */
  warmUp(): Promise<void> {
    return this.opts.session.ready();
  }

  presets(): readonly BotConfig[] {
    return PRESETS;
  }

  /** Inicia um bot. Devolve assim que a ordem de arranque é dada (o bot corre em segundo plano). */
  start(id: string, overrides: Partial<BotConfig> = {}): DigitBot {
    const current = this.bots.get(id);
    if (current?.isRunning) return current;

    const config = buildBotConfig(id, { ...this.opts.defaults, ...overrides });
    const bot = new DigitBot(config, {
      session: this.opts.session,
      limiter: this.limiter,
      feed: () => this.opts.feeds?.(config.symbol),
      log: (m) => this.emitLog(m),
      onTrade: (t: TradeRecord) => this.emit('trade', t),
      onStop: (s: BotStats) => this.emit('stop', s),
    });
    this.bots.set(id, bot);
    void bot.start();
    return bot;
  }

  startMany(ids: string[], overrides: Partial<BotConfig> = {}): DigitBot[] {
    return ids.map((id) => this.start(id, overrides));
  }

  startAll(overrides: Partial<BotConfig> = {}): DigitBot[] {
    return this.startMany(PRESETS.map((p) => p.id), overrides);
  }

  async stop(id: string): Promise<void> {
    await this.bots.get(id)?.stop('manual');
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.bots.values()].map((b) => b.stop('manual')));
  }

  status(): BotStats[] {
    return PRESETS.map((p) => {
      const bot = this.bots.get(p.id);
      return (
        bot?.stats() ?? {
          botId: p.id,
          label: p.label,
          status: 'idle' as const,
          trades: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          profit: 0,
          consecutiveLosses: 0,
          currentStake: p.stake,
          lastLatencyMs: null,
          avgLatencyMs: null,
        }
      );
    });
  }

  private emitLog(m: string): void {
    this.opts.log?.(m);
    this.emit('log', m);
  }
}
