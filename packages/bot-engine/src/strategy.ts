import type { Candle } from "./candles.js";

export type Direction = "up" | "down";

export interface Signal {
  readonly direction: Direction;
  /** Texto curto que explica o sinal (fica registado junto da ordem). */
  readonly reason: string;
}

/**
 * Uma estratégia só decide; nunca executa nem conhece saldos ou limites.
 * Tem de ser determinística: o mesmo histórico de candles dá os mesmos sinais.
 * Este pacote NÃO inclui estratégias de trading.
 */
export interface Strategy {
  readonly name: string;
  onCandle(candle: Candle): Signal | undefined;
}
