import { AppError, err, ok, type Result } from "@nexora/shared";

/**
 * Valores monetários internos são inteiros em unidades mínimas da moeda
 * (ex.: cêntimos em USD, 10^-8 em BTC). Nunca somar nem comparar decimais.
 */
export function toMinorUnits(amount: number, decimals: number): Result<number> {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) {
    return err(new AppError("VALIDATION", "Casas decimais da moeda inválidas (0 a 8)."));
  }
  if (!Number.isFinite(amount)) {
    return err(new AppError("VALIDATION", "Valor monetário inválido."));
  }
  const exact = amount * 10 ** decimals;
  const rounded = Math.round(exact);
  if (!Number.isSafeInteger(rounded)) {
    return err(new AppError("VALIDATION", "Valor monetário fora do intervalo suportado."));
  }
  if (Math.abs(exact - rounded) > 1e-6) {
    return err(new AppError("VALIDATION", "O valor tem mais casas decimais do que a moeda permite."));
  }
  return ok(rounded);
}

/** Só para apresentação. Nunca usar o resultado em cálculos de risco. */
export function fromMinorUnits(minor: number, decimals: number): number {
  return minor / 10 ** decimals;
}
