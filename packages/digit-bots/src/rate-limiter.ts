import type { Limiter } from './types.js';

export interface Window {
  windowMs: number;
  max: number;
}

/**
 * Limitador de janela deslizante. Os limites da Deriv para
 * proposal/buy/sell/proposal_open_contract são 360/min e 14 400/h;
 * os padrões abaixo deixam folga para não bater no RateLimit.
 */
export class RateLimiter implements Limiter {
  private stamps: number[] = [];

  constructor(
    private readonly windows: Window[] = [
      { windowMs: 60_000, max: 300 },
      { windowMs: 3_600_000, max: 14_000 },
    ],
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now();
      const wait = this.waitTime(t);
      if (wait <= 0) {
        this.stamps.push(t);
        this.prune(t);
        return;
      }
      await this.sleep(wait);
    }
  }

  private waitTime(t: number): number {
    let wait = 0;
    for (const w of this.windows) {
      const inWindow = this.stamps.filter((s) => s > t - w.windowMs);
      if (inWindow.length >= w.max) {
        const oldest = inWindow[inWindow.length - w.max]!;
        wait = Math.max(wait, oldest + w.windowMs - t + 1);
      }
    }
    return wait;
  }

  private prune(t: number): void {
    const longest = Math.max(...this.windows.map((w) => w.windowMs));
    const firstKeep = this.stamps.findIndex((s) => s > t - longest);
    if (firstKeep > 0) this.stamps.splice(0, firstKeep);
  }
}
