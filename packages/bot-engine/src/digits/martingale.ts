import type { MartingaleConfig } from "./types.js";

const DEFAULTS: MartingaleConfig = { enabled: true, maxSteps: 4, maxStake: 50, profitTargetMult: 1 };

/**
 * Martingale inteligente: em vez de dobrar às cegas, calcula a stake que recupera
 * a perda acumulada (+ alvo) com o retorno REAL do último contrato; limita passos e teto.
 */
export class SmartMartingale {
  private cfg: MartingaleConfig;
  private lossAcc = 0;
  step = 0;
  private ratio = 0; // lucro por unidade de stake (payout/stake - 1)

  constructor(private base: number, cfg?: Partial<MartingaleConfig>) {
    this.cfg = { ...DEFAULTS, ...cfg };
  }

  learn(stake: number, payout: number): void {
    if (stake > 0 && payout > stake) this.ratio = payout / stake - 1;
  }

  nextStake(): number {
    if (!this.cfg.enabled || this.step === 0) return this.base;
    const target = this.lossAcc + this.base * this.cfg.profitTargetMult;
    const raw = this.ratio > 0 ? target / this.ratio : this.base * 2 ** this.step;
    const s = Math.max(this.base, Math.round(raw * 100) / 100);
    return Math.min(s, this.cfg.maxStake);
  }

  record(stake: number, profit: number): void {
    if (profit > 0) { this.lossAcc = 0; this.step = 0; return; }
    this.lossAcc += stake;
    this.step++;
    if (this.step > this.cfg.maxSteps) { this.lossAcc = 0; this.step = 0; } // corta a sequência
  }
}
