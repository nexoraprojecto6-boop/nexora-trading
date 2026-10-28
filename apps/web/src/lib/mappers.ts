// ============================================================
// NEXORA — Mapeadores entre o servidor e a interface
//
// O servidor descreve cada bot (parâmetros e limites de risco); aqui isso é
// convertido nos campos do formulário que o painel já sabia desenhar.
// Funções puras: fáceis de testar.
// ============================================================
import type { ApiBotDefinition, ApiParamDef, BotSettingsValues } from './api'
import { SYMBOL_OPTIONS, type BotStrategyType, type CatalogBot, type StrategyFieldDef } from './types'

export const GROUP_BOT = 'Parâmetros do bot'
export const GROUP_RISK = 'Limites de risco'

export function toField(def: ApiParamDef, group: string): StrategyFieldDef {
  const base = { key: def.key, label: def.label, group, ...(def.help ? { description: def.help } : {}), ...(def.placeholder ? { placeholder: def.placeholder } : {}) }
  const dflt = def.default !== undefined ? { defaultValue: def.default } : {}
  switch (def.kind) {
    case 'integer':
      return { ...base, ...dflt, type: 'number', valueType: 'integer', min: Number(def.min), max: Number(def.max), step: 1 }
    case 'decimal':
      return { ...base, ...dflt, type: 'number', valueType: 'decimal', min: Number(def.min), max: Number(def.max), step: 0.01 }
    case 'select':
      return { ...base, ...dflt, type: 'select', options: def.options ?? [] }
    case 'symbol': {
      // Mesma lista de mercados do painel antigo; garante que o valor por omissão existe nela.
      const known = SYMBOL_OPTIONS.some(o => o.value === def.default)
      const options = known || typeof def.default !== 'string'
        ? [...SYMBOL_OPTIONS]
        : [...SYMBOL_OPTIONS, { value: def.default, label: def.default }]
      return { ...base, ...dflt, type: 'select', options }
    }
  }
}

export function toCatalogBot(def: ApiBotDefinition, riskParams: ApiParamDef[]): CatalogBot {
  const now = new Date(0).toISOString()
  return {
    id: def.id,
    name: def.name,
    summary: def.summary,
    description: def.description,
    strategy: def.id as BotStrategyType,
    defaultConfig: {},
    paramFields: def.params.map(p => toField(p, GROUP_BOT)),
    riskFields: (def.riskParams ?? riskParams).map(p => toField(p, GROUP_RISK)),
    tags: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
}

/** Valores iniciais de um formulário: guardados > padrão do campo > vazio (não preenchido). */
export function initialValues(
  fields: StrategyFieldDef[],
  saved?: Record<string, string | number>,
): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {}
  for (const f of fields) {
    const fromSaved = saved ? saved[f.key] : undefined
    out[f.key] = fromSaved !== undefined ? fromSaved : f.defaultValue
  }
  return out
}

/**
 * Valores do formulário → corpo do pedido. Campos vazios ficam de fora (o servidor responde
 * "Obrigatório"): nunca se inventa um 0. Decimais seguem como texto exato.
 */
export function buildPayload(
  fields: StrategyFieldDef[],
  values: Record<string, string | number | boolean | undefined>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const f of fields) {
    const v = values[f.key]
    if (v === undefined || v === '' || typeof v === 'boolean') continue
    if (f.type === 'number' && f.valueType === 'decimal') out[f.key] = String(v).trim()
    else if (f.type === 'number') out[f.key] = typeof v === 'number' ? v : Number(v)
    else out[f.key] = String(v)
  }
  return out
}

export function toSettings(
  paramFields: StrategyFieldDef[],
  riskFields: StrategyFieldDef[],
  values: Record<string, string | number | boolean | undefined>,
): BotSettingsValues {
  return { params: buildPayload(paramFields, values), risk: buildPayload(riskFields, values) }
}
