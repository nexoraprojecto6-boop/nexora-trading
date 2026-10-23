import { AppError, err, ok, type Result } from "@nexora/shared";

/** Estrutura mínima de um tick (compatível com o Tick do @nexora/deriv-client). */
export interface PriceTick {
  readonly symbol: string;
  /** Segundos desde 1970-01-01 (UTC). */
  readonly epoch: number;
  readonly quote: number;
}

export interface Candle {
  readonly symbol: string;
  /** Início do intervalo, em segundos desde 1970-01-01 (UTC). */
  readonly openEpoch: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly tickCount: number;
}

/**
 * Agrega ticks de UM símbolo em candles de duração fixa.
 * - Ticks de outro símbolo, inválidos ou atrasados (de um intervalo já fechado) são ignorados.
 * - Intervalos sem ticks não geram candles.
 */
export class CandleAggregator {
  private current: { -readonly [K in keyof Candle]: Candle[K] } | undefined;

  private constructor(
    readonly symbol: string,
    readonly intervalSeconds: number,
  ) {}

  static create(symbol: string, intervalSeconds: number): Result<CandleAggregator> {
    if (symbol.trim() === "") return err(new AppError("VALIDATION", "Símbolo inválido."));
    if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds <= 0) {
      return err(new AppError("VALIDATION", "O intervalo do candle tem de ser um inteiro positivo de segundos."));
    }
    return ok(new CandleAggregator(symbol, intervalSeconds));
  }

  /** Devolve o candle que acabou de fechar, se este tick abriu um novo intervalo. */
  push(tick: PriceTick): Candle | undefined {
    if (tick.symbol !== this.symbol) return undefined;
    if (!Number.isFinite(tick.epoch) || !Number.isFinite(tick.quote) || tick.epoch < 0) return undefined;

    const bucket = Math.floor(tick.epoch / this.intervalSeconds) * this.intervalSeconds;
    const current = this.current;

    if (current === undefined) {
      this.current = this.open(bucket, tick.quote);
      return undefined;
    }
    if (bucket < current.openEpoch) return undefined;
    if (bucket === current.openEpoch) {
      current.high = Math.max(current.high, tick.quote);
      current.low = Math.min(current.low, tick.quote);
      current.close = tick.quote;
      current.tickCount += 1;
      return undefined;
    }
    const closed: Candle = { ...current };
    this.current = this.open(bucket, tick.quote);
    return closed;
  }

  private open(openEpoch: number, quote: number) {
    return { symbol: this.symbol, openEpoch, open: quote, high: quote, low: quote, close: quote, tickCount: 1 };
  }
}
