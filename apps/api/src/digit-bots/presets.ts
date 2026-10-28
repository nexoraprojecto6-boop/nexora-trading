import type { BotConfig, DigitOption } from './types.js';

export const DEFAULT_SYMBOL = 'R_100';

const BASE = {
  symbol: DEFAULT_SYMBOL,
  stake: 1,
  stopLoss: 20,
  takeProfit: 10,
  maxConsecutiveLosses: 0,
  maxTrades: 0,
  stakeMultiplierOnLoss: 1,
  maxStake: 10,
  cooldownMs: 0,
} as const;

const over = (barrier: number): DigitOption => ({ contractType: 'DIGITOVER', barrier });
const under = (barrier: number): DigitOption => ({ contractType: 'DIGITUNDER', barrier });

/**
 * Os 6 bots. Todos usam contratos de 1 tick. Os "inteligentes" (adaptive) comparam,
 * antes de cada ordem, a percentagem recente de cada lado e entram no mais forte.
 */
export const PRESETS: readonly BotConfig[] = [
  { ...BASE, id: 'even-odd', label: 'Pares/Ímpares (inteligente)', adaptive: true, options: [{ contractType: 'DIGITEVEN' }, { contractType: 'DIGITODD' }] },
  { ...BASE, id: 'over-3', label: 'Superior a 3 (Over 3)', adaptive: false, options: [over(3)] },
  { ...BASE, id: 'over-1', label: 'Superior a 1 (Over 1)', adaptive: false, options: [over(1)] },
  { ...BASE, id: 'over3-under3', label: 'Superior/Inferior a 3 (inteligente)', adaptive: true, options: [over(3), under(3)] },
  { ...BASE, id: 'under-8', label: 'Abaixo de 8 (Under 8)', adaptive: false, options: [under(8)] },
  { ...BASE, id: 'under8-over7', label: 'Abaixo de 8 / Acima de 7 (inteligente)', adaptive: true, options: [under(8), over(7)] },
];

const NEEDS_BARRIER = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];

export function validateConfig(c: BotConfig): BotConfig {
  const fail = (m: string): never => {
    throw new Error(`Config inválida do bot "${c.id}": ${m}`);
  };
  if (!(c.stake > 0) || !Number.isFinite(c.stake)) fail('stake deve ser > 0');
  if (!c.symbol) fail('symbol é obrigatório');
  if (c.stopLoss < 0 || c.takeProfit < 0) fail('stopLoss/takeProfit não podem ser negativos');
  if (c.stakeMultiplierOnLoss < 1) fail('stakeMultiplierOnLoss deve ser >= 1');
  if (c.stakeMultiplierOnLoss > 1 && c.maxStake < c.stake) fail('maxStake deve ser >= stake');
  if (c.options.length === 0) fail('o bot precisa de pelo menos uma opção');
  for (const o of c.options) {
    if (!NEEDS_BARRIER.includes(o.contractType)) continue;
    const b = o.barrier;
    if (b === undefined || !Number.isInteger(b) || b < 0 || b > 9) fail('barrier deve ser um inteiro 0-9');
    if (o.contractType === 'DIGITOVER' && b! > 8) fail('DIGITOVER aceita barrier 0-8');
    if (o.contractType === 'DIGITUNDER' && b! < 1) fail('DIGITUNDER aceita barrier 1-9');
  }
  return c;
}

export function buildBotConfig(id: string, overrides: Partial<BotConfig> = {}): BotConfig {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Bot desconhecido: "${id}". Disponíveis: ${PRESETS.map((p) => p.id).join(', ')}`);
  return validateConfig({ ...preset, ...overrides, id: preset.id, options: preset.options, adaptive: preset.adaptive });
}
