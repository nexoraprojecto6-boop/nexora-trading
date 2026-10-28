/** Último dígito do preço, respeitando o pip_size (ex.: 1234.50 com pip 2 -> 0). */
export function lastDigit(quote: number, pipSize: number): number {
  const s = quote.toFixed(Math.max(0, pipSize));
  return Number(s[s.length - 1]);
}

/** Estatística rolante dos últimos dígitos (informativa; não altera as probabilidades). */
export class DigitStats {
  private window: number[] = [];

  constructor(private readonly size = 100) {}

  push(digit: number): void {
    this.window.push(digit);
    if (this.window.length > this.size) this.window.shift();
  }

  get count(): number {
    return this.window.length;
  }

  /** Percentagem (0-100) de cada dígito na janela. */
  frequencies(): number[] {
    const counts = new Array<number>(10).fill(0);
    for (const d of this.window) counts[d]! += 1;
    const n = Math.max(1, this.window.length);
    return counts.map((c) => (c / n) * 100);
  }

  overPct(barrier: number): number {
    return this.pct((d) => d > barrier);
  }

  underPct(barrier: number): number {
    return this.pct((d) => d < barrier);
  }

  evenPct(): number {
    return this.pct((d) => d % 2 === 0);
  }

  private pct(pred: (d: number) => boolean): number {
    if (this.window.length === 0) return 0;
    return (this.window.filter(pred).length / this.window.length) * 100;
  }
}
