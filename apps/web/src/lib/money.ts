// ============================================================
// NEXORA FOREX — Moeda da conta (espelha utils/currency.ts do backend)
// ============================================================
// Nunca assumir "USD" nem "$": a conta pode ser EUR, GBP, BTC, etc.

const DECIMALS: Record<string, number> = {
  USD: 2, EUR: 2, GBP: 2, AUD: 2, CAD: 2, CHF: 2, JPY: 2, NZD: 2,
  USDC: 2, UST: 2, EUSDT: 2, TUSDT: 2, USDT: 2, DAI: 2, TUSD: 2, PAX: 2, BUSD: 2,
  BTC: 8, ETH: 8, LTC: 8,
}

export function currencyDecimals(code?: string): number {
  return DECIMALS[(code ?? 'USD').toUpperCase()] ?? 2
}

/** "1.50 EUR" · "0.00010000 BTC" */
export function formatMoney(n: number | string | null | undefined, code?: string): string {
  const cur = (code ?? 'USD').toUpperCase()
  const v = Number(n)
  return `${(Number.isFinite(v) ? v : 0).toFixed(currencyDecimals(cur))} ${cur}`
}

/**
 * pip_size do tick → nº de casas decimais.
 * A Deriv pode enviar o nº de casas (2) ou o passo (0.01); aceita os dois.
 */
export function decimalsFromPip(pip: number | undefined, fallback = 2): number {
  if (pip === undefined || !Number.isFinite(pip) || pip <= 0) return fallback
  return pip >= 1 ? Math.round(pip) : Math.round(-Math.log10(pip))
}
