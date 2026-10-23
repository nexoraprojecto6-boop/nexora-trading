import { AppError, err, ok, type Result } from "@nexora/shared";
import type { Direction } from "./strategy.js";

/** Intenção de operação: ainda não executada. Valores em unidades mínimas da moeda. */
export interface OrderIntent {
  readonly symbol: string;
  readonly direction: Direction;
  readonly stakeMinor: number;
  readonly currency: string;
  readonly createdAtEpoch: number;
  readonly strategy: string;
  readonly reason: string;
}

/** Todos os limites são obrigatórios: não existe "sem limite". */
export interface RiskLimits {
  /** Valor máximo de cada operação. */
  readonly maxStakeMinor: number;
  /** Perda máxima por dia UTC, contando também o valor em risco nas posições abertas. */
  readonly maxDailyLossMinor: number;
  readonly maxTradesPerDay: number;
  readonly maxOpenPositions: number;
  /** Ao atingir este número de perdas seguidas, o robô fica parado até `resume()`. */
  readonly maxConsecutiveLosses: number;
  /** Segundos mínimos entre aberturas de operações (0 = sem espera). */
  readonly cooldownSeconds: number;
}

export type RejectReason =
  | "halted"
  | "stake_invalid"
  | "stake_exceeds_limit"
  | "daily_loss_limit"
  | "daily_trade_limit"
  | "max_open_positions"
  | "cooldown";

export type RiskDecision =
  | { readonly approved: true }
  | { readonly approved: false; readonly reason: RejectReason };

export interface RiskSnapshot {
  readonly halted: boolean;
  readonly haltReason: string | undefined;
  readonly dayKey: number | undefined;
  readonly dailyPnlMinor: number;
  readonly tradesToday: number;
  readonly openPositions: number;
  readonly openStakeMinor: number;
  readonly consecutiveLosses: number;
}

const SECONDS_PER_DAY = 86_400;

function isPositiveSafeInt(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Porteiro de risco. Cada operação passa por `evaluate` antes de ser executada.
 * Fica em memória: ao reiniciar o processo, o estado tem de ser reposto a partir
 * do histórico real (tarefa do worker) antes de aprovar qualquer operação.
 */
export class RiskManager {
  private haltReason: string | undefined;
  private dayKey: number | undefined;
  private dailyPnlMinor = 0;
  private tradesToday = 0;
  private openPositions = 0;
  private openStakeMinor = 0;
  private consecutiveLosses = 0;
  private lastOpenedEpoch: number | undefined;

  private constructor(private readonly limits: RiskLimits) {}

  static create(limits: RiskLimits): Result<RiskManager> {
    const positive: (keyof RiskLimits)[] = [
      "maxStakeMinor",
      "maxDailyLossMinor",
      "maxTradesPerDay",
      "maxOpenPositions",
      "maxConsecutiveLosses",
    ];
    for (const key of positive) {
      if (!isPositiveSafeInt(limits[key])) {
        return err(new AppError("VALIDATION", `Limite de risco inválido: ${key} tem de ser um inteiro positivo.`));
      }
    }
    if (!Number.isSafeInteger(limits.cooldownSeconds) || limits.cooldownSeconds < 0) {
      return err(new AppError("VALIDATION", "Limite de risco inválido: cooldownSeconds tem de ser um inteiro >= 0."));
    }
    return ok(new RiskManager({ ...limits }));
  }

  get halted(): boolean {
    return this.haltReason !== undefined;
  }

  /** Interruptor de emergência: nenhuma operação é aprovada até `resume()`. */
  halt(reason: string): void {
    this.haltReason = this.haltReason ?? reason;
  }

  /** Retoma explicitamente. Reinicia a contagem de perdas seguidas. */
  resume(): void {
    this.haltReason = undefined;
    this.consecutiveLosses = 0;
  }

  evaluate(intent: OrderIntent, nowEpoch: number): RiskDecision {
    this.rollDay(nowEpoch);

    if (this.halted) return reject("halted");
    if (!isPositiveSafeInt(intent.stakeMinor)) return reject("stake_invalid");
    if (intent.stakeMinor > this.limits.maxStakeMinor) return reject("stake_exceeds_limit");

    // Pior caso: perda já realizada hoje + valor em risco nas posições abertas + esta operação.
    const worstCaseLoss = Math.max(0, -this.dailyPnlMinor) + this.openStakeMinor + intent.stakeMinor;
    if (worstCaseLoss > this.limits.maxDailyLossMinor) return reject("daily_loss_limit");

    if (this.tradesToday >= this.limits.maxTradesPerDay) return reject("daily_trade_limit");
    if (this.openPositions >= this.limits.maxOpenPositions) return reject("max_open_positions");
    if (
      this.lastOpenedEpoch !== undefined &&
      nowEpoch - this.lastOpenedEpoch < this.limits.cooldownSeconds
    ) {
      return reject("cooldown");
    }
    return { approved: true };
  }

  /** Chamar depois de a operação ter sido aceite pela corretora. */
  recordOpened(stakeMinor: number, nowEpoch: number): void {
    this.rollDay(nowEpoch);
    this.tradesToday += 1;
    this.openPositions += 1;
    this.openStakeMinor += stakeMinor;
    this.lastOpenedEpoch = nowEpoch;
  }

  /** Chamar quando a operação fecha. `pnlMinor` é negativo numa perda. */
  recordClosed(stakeMinor: number, pnlMinor: number, nowEpoch: number): void {
    this.rollDay(nowEpoch);
    this.openPositions = Math.max(0, this.openPositions - 1);
    this.openStakeMinor = Math.max(0, this.openStakeMinor - stakeMinor);
    this.dailyPnlMinor += pnlMinor;
    this.consecutiveLosses = pnlMinor < 0 ? this.consecutiveLosses + 1 : 0;
    if (this.consecutiveLosses >= this.limits.maxConsecutiveLosses) {
      this.halt("consecutive_losses");
    }
  }

  snapshot(): RiskSnapshot {
    return {
      halted: this.halted,
      haltReason: this.haltReason,
      dayKey: this.dayKey,
      dailyPnlMinor: this.dailyPnlMinor,
      tradesToday: this.tradesToday,
      openPositions: this.openPositions,
      openStakeMinor: this.openStakeMinor,
      consecutiveLosses: this.consecutiveLosses,
    };
  }

  /** Novo dia UTC: zera o resultado e o número de operações do dia (não zera paragens nem posições abertas). */
  private rollDay(nowEpoch: number): void {
    const key = Math.floor(nowEpoch / SECONDS_PER_DAY);
    if (this.dayKey !== key) {
      this.dayKey = key;
      this.dailyPnlMinor = 0;
      this.tradesToday = 0;
    }
  }
}

function reject(reason: RejectReason): RiskDecision {
  return { approved: false, reason };
}
