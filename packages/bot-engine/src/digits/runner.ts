import { BOTS, type BotDef } from "./bots.js";
import { SmartMartingale } from "./martingale.js";
import type { TickFeed } from "./tick-feed.js";
import type { TradeSocket } from "./trade-socket.js";
import type { BotEvent, RunOptions, Tick } from "./types.js";

export interface RunnerConfig { symbol: string; currency: string; onEvent: (e: BotEvent) => void }

/**
 * Um runner por conta. feed e trade devem estar JÁ ligados antes do clique:
 * assim `start()` compra no mesmo instante, sem ligação, sem proposal, sem esperar tick.
 */
export class BotRunner {
  private bot?: BotDef;
  private opts?: RunOptions;
  private mg?: SmartMartingale;
  private busy = false;
  private busySince = 0;
  private session = 0;
  private lastEntryEpoch = 0;
  private lastStake = 0;
  private off: Array<() => void> = [];

  constructor(private feed: TickFeed, private trade: TradeSocket, private cfg: RunnerConfig) {}

  get running(): boolean { return !!this.bot; }

  start(botId: string, opts: RunOptions): void {
    if (this.bot) this.stop("reiniciado");
    const bot = BOTS[botId];
    if (!bot) throw new Error(`bot desconhecido: ${botId}`);
    this.bot = bot; this.opts = opts; this.session = 0; this.busy = false; this.lastEntryEpoch = 0;
    this.mg = bot.mode === "sequential"
      ? new SmartMartingale(opts.stake, opts.martingale)
      : new SmartMartingale(opts.stake, { enabled: false });

    this.off.push(this.feed.on((t) => this.onTick(t)));
    this.off.push(this.trade.onSettled((s) => this.onSettled(s.profit)));
    this.cfg.onEvent({ type: "started", botId });

    const last = this.feed.window.last;
    if (last) {
      // Clique = entrada imediata. Scalper respeita a condição (último dígito < 3).
      if (bot.mode === "sequential" || bot.shouldEnter(this.feed.window, last.digit)) void this.enter(last);
    }
  }

  stop(reason = "parado pelo utilizador"): void {
    if (!this.bot) return;
    const id = this.bot.id;
    this.off.forEach((f) => f()); this.off = [];
    this.bot = undefined;
    this.cfg.onEvent({ type: "stopped", botId: id, reason });
  }

  private onTick(t: Tick): void {
    const bot = this.bot;
    if (!bot) return;
    if (this.busy && Date.now() - this.busySince > 8000) this.busy = false; // salvaguarda
    if (bot.mode === "scalper") {
      // 1 compra por tick, sem esperar o resultado da anterior.
      if (t.epoch !== this.lastEntryEpoch && bot.shouldEnter(this.feed.window, t.digit)) void this.enter(t);
    } else if (!this.busy && bot.shouldEnter(this.feed.window, t.digit)) {
      void this.enter(t);
    }
  }

  private onSettled(profit: number): void {
    const bot = this.bot;
    if (!bot || !this.opts) return;
    this.session += profit;
    this.mg!.record(this.lastStake, profit);
    this.cfg.onEvent({ type: "result", botId: bot.id, profit, won: profit > 0, sessionProfit: this.session });
    if (this.opts.stopLoss !== undefined && this.session <= -this.opts.stopLoss) return this.stop("stop loss");
    if (this.opts.takeProfit !== undefined && this.session >= this.opts.takeProfit) return this.stop("take profit");
    if (bot.mode === "sequential") {
      this.busy = false;
      const last = this.feed.window.last;
      // Recuperação: entra logo (sem esperar tick) se já havia perda; senão segue o filtro.
      if (last && (this.mg!.step > 0 || bot.shouldEnter(this.feed.window, last.digit))) void this.enter(last);
    }
  }

  private async enter(t: Tick): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    const stake = bot.mode === "scalper" ? this.opts!.stake : this.mg!.nextStake();
    this.busy = true; this.busySince = Date.now();
    this.lastEntryEpoch = t.epoch; this.lastStake = stake;
    const t0 = Date.now();
    try {
      const r = await this.trade.buy({
        contract_type: bot.contract, barrier: bot.barrier,
        underlying_symbol: this.cfg.symbol, amount: stake, currency: this.cfg.currency,
      });
      this.mg!.learn(r.buy_price, r.payout);
      this.cfg.onEvent({ type: "entry", botId: bot.id, stake, digit: t.digit, step: this.mg!.step, latencyMs: Date.now() - t0 });
    } catch (e) {
      if (bot.mode === "sequential") this.busy = false;
      this.cfg.onEvent({ type: "error", botId: bot.id, message: (e as Error).message });
    }
  }
}
