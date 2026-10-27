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

/**
 * Converte texto decimal exato (ex.: "12.50") para unidades mínimas, sem passar por vírgula flutuante.
 * Rejeita casas decimais a mais para a moeda e valores fora do intervalo seguro.
 */
export function decimalToMinorUnits(text: string, decimals: number): Result<number> {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) {
    return err(new AppError("VALIDATION", "Casas decimais da moeda inválidas (0 a 8)."));
  }
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(text)) {
    return err(new AppError("VALIDATION", "Valor monetário inválido."));
  }
  const [whole = "0", fraction = ""] = text.split(".");
  if (fraction.length > decimals) {
    return err(new AppError("VALIDATION", "O valor tem mais casas decimais do que a moeda permite."));
  }
  const minor = Number(whole + fraction.padEnd(decimals, "0"));
  if (!Number.isSafeInteger(minor)) {
    return err(new AppError("VALIDATION", "Valor monetário fora do intervalo suportado."));
  }
  return ok(minor);
}

/** Forma canónica de um decimal exato: sem zeros à esquerda nem zeros finais ("007.500" → "7.5"). */
export function normalizeDecimal(text: string): string {
  const [whole = "0", fraction = ""] = text.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed === "" ? BigInt(whole).toString() : `${BigInt(whole).toString()}.${trimmed}`;
}
