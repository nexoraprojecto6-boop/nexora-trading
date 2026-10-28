import type { Tick } from "./types.js";

/** Última casa decimal usando pip_size (toString() perde zeros finais e erra o dígito). */
export function lastDigit(quote: number, pipSize: number): number {
  const s = quote.toFixed(pipSize);
  return s.charCodeAt(s.length - 1) - 48;
}

/** Janela circular com contagens O(1) por tick. */
export class DigitWindow {
  private buf: number[] = [];
  private counts = new Array<number>(10).fill(0);
  last: Tick | null = null;
  constructor(private size = 50) {}

  push(t: Tick): void {
    this.last = t;
    this.buf.push(t.digit);
    this.counts[t.digit]++;
    if (this.buf.length > this.size) this.counts[this.buf.shift()!]--;
  }
  get length(): number { return this.buf.length; }
  count(d: number): number { return this.counts[d]; }
  /** Fracção dos últimos n dígitos que cumprem pred. */
  share(pred: (d: number) => boolean, n = 20): number {
    const s = this.buf.slice(-n);
    return s.length ? s.filter(pred).length / s.length : 0;
  }
  recent(n: number): number[] { return this.buf.slice(-n); }
}
