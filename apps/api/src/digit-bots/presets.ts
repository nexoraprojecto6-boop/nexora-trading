import type { BotConfig, DigitContractType } from './types.js';

export const DEFAULT_SYMBOL = 'R_100';

const BASE = {
  symbol: DEFAULT_SYMBOL,
  stake: 1,
  stopLoss: 20,
  takeProfit: 10,
  maxConsecutiveLosses: 5,
  maxTrades: 0,
  stakeMultiplierOnLoss: 1,
  maxStake: 10,
  cooldownMs: 0,
} as const;

/**
 * Os 6 bots pedidos. Todos usam contratos de 1 tick.
 * "Dígito 3" e "Dígito 1" = Differs (DIGITDIFF). Para usar Matches ou Over,
 * passe { contractType: 'DIGITMATCH' } (ou 'DIGITOVER') nos overrides.
 */
export const PRESETS: readonly BotConfig[] = [
  { ...BASE, id: 'digit-3', label: 'Dígito 3 (Differs)', contractType: 'DIGITDIFF', barrier: 3 },
  { ...BASE, id: 'digit-1', label: 'Dígito 1 (Differs)', contractType: 'DIGITDIFF', barrier: 1 },
  { ...BASE, id: 'over-5', label: 'Acima de 5 (Over 5)', contractType: 'DIGITOVER', barrier: 5 },
  { ...BASE, id: 'under-8', label: 'Abaixo de 8 (Under 8)', contractType: 'DIGITUNDER', barrier: 8 },
  { ...BASE, id: 'even', label: 'Pares (Even)', contractType: 'DIGITEVEN' },
  { ...BASE, id: 'odd', label: 'Ímpares (Odd)', contractType: 'DIGITODD' },
];

const NEEDS_BARRIER: DigitContractType[] = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];

export function validateConfig(c: BotConfig): BotConfig {
  const fail = (m: string): never => {
    throw new Error(`Config inválida do bot "${c.id}": ${m}`);
  };
  if (!(c.stake > 0) || !Number.isFinite(c.stake)) fail('stake deve ser > 0');
  if (!c.symbol) fail('symbol é obrigatório');
  if (c.stopLoss < 0 || c.takeProfit < 0) fail('stopLoss/takeProfit não podem ser negativos');
  if (c.stakeMultiplierOnLoss < 1) fail('stakeMultiplierOnLoss deve ser >= 1');
  if (c.stakeMultiplierOnLoss > 1 && c.maxStake < c.stake) fail('maxStake deve ser >= stake');
  if (NEEDS_BARRIER.includes(c.contractType)) {
    const b = c.barrier;
    if (b === undefined || !Number.isInteger(b) || b < 0 || b > 9) fail('barrier deve ser um inteiro 0-9');
    if (c.contractType === 'DIGITOVER' && b! > 8) fail('DIGITOVER aceita barrier 0-8');
    if (c.contractType === 'DIGITUNDER' && b! < 1) fail('DIGITUNDER aceita barrier 1-9');
  }
  return c;
}

export function buildBotConfig(id: string, overrides: Partial<BotConfig> = {}): BotConfig {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Bot desconhecido: "${id}". Disponíveis: ${PRESETS.map((p) => p.id).join(', ')}`);
  const merged: BotConfig = { ...preset, ...overrides, id: preset.id };
  if (['DIGITEVEN', 'DIGITODD'].includes(merged.contractType)) delete merged.barrier;
  return validateConfig(merged);
}
