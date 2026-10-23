import { AppError, err, ok, type Result } from "@nexora/shared";
import type { Candle, CandleAggregator, PriceTick } from "./candles.js";
import type { OrderIntent, RiskDecision, RiskManager } from "./risk.js";
import type { Signal, Strategy } from "./strategy.js";

export type EngineEvent =
  | { readonly type: "candle"; readonly candle: Candle }
  | { readonly type: "signal"; readonly signal: Signal }
  | { readonly type: "intent"; readonly intent: OrderIntent; readonly decision: RiskDecision }
  | { readonly type: "strategy_error"; readonly message: string };

export interface BotRunnerOptions {
  readonly currency: string;
  /** Valor de cada operação, em unidades mínimas da moeda. */
  readonly stakeMinor: number;
  readonly strategy: Strategy;
  readonly aggregator: CandleAggregator;
  readonly risk: RiskManager;
}

/**
 * Liga ticks → candles → estratégia → risco. Só produz eventos e intenções:
 * quem chama decide se executa as aprovadas e, se executar, tem de chamar
 * `risk.recordOpened` / `risk.recordClosed`.
 * O "relógio" é o `epoch` dos ticks, por isso o comportamento é determinístico e testável.
 * Se a estratégia lançar uma exceção, o robô fica parado (falha segura).
 */
export class BotRunner {
  private constructor(private readonly options: BotRunnerOptions) {}

  static create(options: BotRunnerOptions): Result<BotRunner> {
    if (!Number.isSafeInteger(options.stakeMinor) || options.stakeMinor <= 0) {
      return err(new AppError("VALIDATION", "stakeMinor tem de ser um inteiro positivo."));
    }
    if (options.currency.trim() === "") return err(new AppError("VALIDATION", "Moeda inválida."));
    return ok(new BotRunner(options));
  }

  onTick(tick: PriceTick): EngineEvent[] {
    const { aggregator, strategy, risk, stakeMinor, currency } = this.options;
    const closed = aggregator.push(tick);
    if (closed === undefined) return [];

    const events: EngineEvent[] = [{ type: "candle", candle: closed }];
    if (risk.halted) return events;

    let signal: Signal | undefined;
    try {
      signal = strategy.onCandle(closed);
    } catch (cause) {
      risk.halt("strategy_error");
      events.push({ type: "strategy_error", message: cause instanceof Error ? cause.name : "erro desconhecido" });
      return events;
    }
    if (signal === undefined) return events;

    events.push({ type: "signal", signal });
    const intent: OrderIntent = {
      symbol: closed.symbol,
      direction: signal.direction,
      stakeMinor,
      currency,
      createdAtEpoch: tick.epoch,
      strategy: strategy.name,
      reason: signal.reason,
    };
    events.push({ type: "intent", intent, decision: risk.evaluate(intent, tick.epoch) });
    return events;
  }
}
