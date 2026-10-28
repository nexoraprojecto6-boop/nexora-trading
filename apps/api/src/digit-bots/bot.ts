import { DerivApiError } from './errors.js';
import { expectedShare, MIN_SAMPLE, optionPredicate, type DigitStats } from './feed.js';
import type {
  BotConfig,
  BotStats,
  BotStatus,
  DigitOption,
  Limiter,
  OpenContract,
  StopReason,
  TradeRecord,
  TradingSession,
} from './types.js';

export interface BotDeps {
  session: TradingSession;
  limiter: Limiter;
  onTrade?: (t: TradeRecord) => void;
  onStop?: (stats: BotStats) => void;
  log?: (msg: string) => void;
  /** Dígitos recentes do símbolo do bot (já em memória: a análise é instantânea). */
  stats?: () => DigitStats | undefined;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Tempo máximo à espera da liquidação de um contrato de 1 tick. */
  settleTimeoutMs?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => (v === undefined || v === null ? NaN : Number(v));

/**
 * Um bot de dígitos. Ao fazer start() compra IMEDIATAMENTE (sem esperar tick nem
 * proposta: usa `buy: 1` + `parameters`, uma única ida-e-volta) e, assim que o
 * contrato de 1 tick liquida, compra o seguinte, até atingir um limite de risco.
 */
export class DigitBot {
  private status: BotStatus = 'idle';
  private stopReason?: StopReason;
  private lastError?: string;
  private loop?: Promise<void>;

  private trades = 0;
  private wins = 0;
  private losses = 0;
  private profit = 0;
  private consecutiveLosses = 0;
  private consecutiveErrors = 0;
  private stake: number;
  private latencies: number[] = [];
  private open: { contractId: number; stake: number; at: number } | null = null;

  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (msg: string) => void;
  private readonly settleTimeoutMs: number;

  constructor(
    public readonly config: BotConfig,
    private readonly deps: BotDeps,
  ) {
    this.stake = config.stake;
    this.now = deps.now ?? (() => Date.now());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = deps.log ?? (() => {});
    this.settleTimeoutMs = deps.settleTimeoutMs ?? 20_000;
  }

  get isRunning(): boolean {
    return this.status === 'running';
  }

  start(): Promise<void> {
    if (this.status === 'running') return this.loop ?? Promise.resolve();
    this.status = 'running';
    this.stopReason = undefined;
    this.lastError = undefined;
    this.consecutiveErrors = 0;
    this.loop = this.run();
    return this.loop;
  }

  /** Pede paragem; a operação em curso (se houver) termina e é contabilizada. */
  async stop(reason: StopReason = 'manual'): Promise<void> {
    if (this.status !== 'running') return;
    this.finish(reason);
    await this.loop;
  }

  stats(): BotStats {
    const n = this.latencies.length;
    return {
      botId: this.config.id,
      label: this.config.label,
      status: this.status,
      stopReason: this.stopReason,
      lastError: this.lastError,
      trades: this.trades,
      wins: this.wins,
      losses: this.losses,
      winRate: this.trades ? this.wins / this.trades : 0,
      profit: round2(this.profit),
      consecutiveLosses: this.consecutiveLosses,
      currentStake: this.stake,
      lastLatencyMs: n ? this.latencies[n - 1]! : null,
      avgLatencyMs: n ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / n) : null,
      ...(this.open ? { open: this.open } : {}),
    };
  }

  private finish(reason: StopReason, err?: unknown): void {
    if (this.status !== 'running') return;
    this.status = 'stopped';
    this.stopReason = reason;
    if (err) this.lastError = err instanceof Error ? err.message : String(err);
    this.log(`[${this.config.id}] parado: ${reason}${this.lastError ? ` (${this.lastError})` : ''}`);
    this.deps.onStop?.(this.stats());
  }

  private limitReached(): StopReason | null {
    const c = this.config;
    if (c.stopLoss > 0 && this.profit <= -c.stopLoss) return 'stop_loss';
    if (c.takeProfit > 0 && this.profit >= c.takeProfit) return 'take_profit';
    if (c.maxConsecutiveLosses > 0 && this.consecutiveLosses >= c.maxConsecutiveLosses) {
      return 'max_consecutive_losses';
    }
    if (c.maxTrades > 0 && this.trades >= c.maxTrades) return 'max_trades';
    return null;
  }

  private async run(): Promise<void> {
    try {
      await this.deps.session.ready();
      while (this.status === 'running') {
        const limit = this.limitReached();
        if (limit) {
          this.finish(limit);
          break;
        }
        await this.deps.limiter.acquire();
        if (this.status !== 'running') break;
        await this.tradeOnce();
        if (this.status === 'running' && this.config.cooldownMs > 0) {
          await this.sleep(this.config.cooldownMs);
        }
      }
    } catch (e) {
      this.finish('error', e);
    }
  }

  /**
   * Escolhe a opção da próxima ordem. Um bot inteligente nunca entra às cegas: se ainda faltam
   * dígitos, espera até 3 s por eles e, não os havendo, pára com erro em vez de arriscar.
   */
  private async choose(): Promise<{ option: DigitOption; pct: number | null }> {
    const first = this.config.options[0]!;
    let stats = this.deps.stats?.();
    if (this.config.adaptive) {
      for (let i = 0; i < 30 && this.status === 'running' && (!stats || stats.count < MIN_SAMPLE); i++) {
        await this.sleep(100);
        stats = this.deps.stats?.();
      }
      if (this.status === 'running' && (!stats || stats.count < MIN_SAMPLE)) {
        throw new Error('Sem dados do mercado para analisar. Tente novamente.');
      }
    }
    if (!stats || stats.count < MIN_SAMPLE) return { option: first, pct: null };
    const candidates = this.config.adaptive ? this.config.options : [first];
    let best = first;
    let bestScore = -Infinity;
    for (const o of candidates) {
      const pred = optionPredicate(o);
      // Força relativa: quanto o lado está acima do normal (os últimos 20 ticks pesam mais que os 100).
      const score = (0.6 * stats.share(pred, 20) + 0.4 * stats.share(pred)) / expectedShare(o);
      if (score > bestScore) {
        best = o;
        bestScore = score;
      }
    }
    return { option: best, pct: Math.round(stats.share(optionPredicate(best)) * 100) };
  }

  private buyMessage(option: DigitOption): Record<string, unknown> {
    const c = this.config;
    const parameters: Record<string, unknown> = {
      amount: this.stake,
      basis: 'stake',
      contract_type: option.contractType,
      currency: this.deps.session.currency,
      duration: 1,
      duration_unit: 't',
      underlying_symbol: c.symbol,
    };
    if (option.barrier !== undefined) parameters.barrier = String(option.barrier);
    return { buy: 1, price: this.stake, subscribe: 1, parameters };
  }

  private async tradeOnce(): Promise<void> {
    const stake = this.stake;
    const pick = await this.choose();
    if (this.status !== 'running') return;
    const t0 = this.now();
    let receipt: any;
    try {
      const res = await this.deps.session.request(this.buyMessage(pick.option));
      receipt = res.buy;
      if (!receipt) throw new Error('Resposta de compra sem recibo');
      this.consecutiveErrors = 0;
    } catch (e) {
      await this.handleBuyError(e);
      return;
    }
    const latency = this.now() - t0;
    this.open = { contractId: receipt.contract_id, stake, at: this.now() };

    let poc: OpenContract;
    try {
      poc = await this.waitSettlement(receipt.contract_id);
    } catch (e) {
      this.open = null;
      // Estado incerto: não repetimos a compra às cegas.
      this.finish('error', e);
      return;
    }

    this.open = null;
    const status = String(poc.status ?? '');
    let profit = num(poc.profit);
    if (Number.isNaN(profit)) profit = num(poc.sell_price) - num(poc.buy_price);
    if (Number.isNaN(profit)) profit = status === 'won' ? num(receipt.payout) - stake : -stake;
    const won = status === 'won' || (status !== 'lost' && profit > 0);

    this.trades += 1;
    this.profit += profit;
    this.latencies.push(latency);
    if (this.latencies.length > 200) this.latencies.shift();
    if (won) {
      this.wins += 1;
      this.consecutiveLosses = 0;
      this.stake = this.config.stake;
    } else {
      this.losses += 1;
      this.consecutiveLosses += 1;
      this.stake = this.nextStakeAfterLoss(stake);
    }

    const balanceAfter = typeof receipt.balance_after === 'number' ? receipt.balance_after : null;
    const exit = poc.exit_tick_display_value ?? poc.exit_tick;
    const record: TradeRecord = {
      botId: this.config.id,
      contractId: receipt.contract_id,
      contractType: pick.option.contractType,
      ...(pick.option.barrier !== undefined ? { barrier: pick.option.barrier } : {}),
      ...(pick.pct !== null ? { pickPct: pick.pct } : {}),
      stake,
      payout: num(receipt.payout),
      profit: round2(profit),
      won,
      latencyMs: latency,
      settledMs: this.now() - t0,
      balanceAfter,
      ...(exit !== undefined && exit !== null ? { exitSpot: String(exit) } : {}),
      at: this.now(),
    };
    this.deps.onTrade?.(record);

    if (balanceAfter !== null && balanceAfter < this.stake) this.finish('insufficient_balance');
  }

  private nextStakeAfterLoss(lastStake: number): number {
    const c = this.config;
    if (c.stakeMultiplierOnLoss <= 1) return c.stake;
    const next = round2(lastStake * c.stakeMultiplierOnLoss);
    return next > c.maxStake ? c.stake : next;
  }

  private async handleBuyError(e: unknown): Promise<void> {
    const msg = e instanceof Error ? e.message : String(e);
    this.lastError = msg;
    if (e instanceof DerivApiError) {
      if (e.code === 'InsufficientBalance') return this.finish('insufficient_balance', e);
      if (e.code === 'RateLimit') {
        this.log(`[${this.config.id}] RateLimit — a aguardar 2 s`);
        await this.sleep(2_000);
        return;
      }
      if (e.code === 'InputValidationFailed' || e.code === 'InvalidToken' || e.code === 'Unauthorized') {
        return this.finish('error', e); // não adianta repetir
      }
    }
    this.consecutiveErrors += 1;
    this.log(`[${this.config.id}] erro na compra (${this.consecutiveErrors}/5): ${msg}`);
    if (this.consecutiveErrors >= 5) return this.finish('error', e);
    await this.sleep(500);
  }

  private waitSettlement(contractId: number): Promise<OpenContract> {
    const isDone = (p: OpenContract) =>
      p.is_sold === 1 || p.status === 'won' || p.status === 'lost' || p.status === 'sold';

    return new Promise<OpenContract>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let unsub: () => void = () => {};
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        unsub();
        fn();
      };
      unsub = this.deps.session.watchContract(contractId, (p) => {
        if (isDone(p)) done(() => resolve(p));
      });
      if (settled) {
        unsub(); // o callback disparou durante o watch (estado já conhecido)
        return;
      }
      timer = setTimeout(async () => {
        // Última verificação direta antes de desistir.
        try {
          const res = await this.deps.session.request({
            proposal_open_contract: 1,
            contract_id: contractId,
          });
          const p = res.proposal_open_contract as OpenContract | undefined;
          if (p && isDone(p)) return done(() => resolve(p));
        } catch {
          /* cai no reject abaixo */
        }
        done(() =>
          reject(
            new Error(
              `Contrato ${contractId} sem liquidação após ${this.settleTimeoutMs} ms. Verifique o histórico da conta.`,
            ),
          ),
        );
      }, this.settleTimeoutMs);
    });
  }
}
