// ============================================================
// NEXORA FOREX — Tipos partilhados (espelha bot.types.ts do backend)
// ============================================================

export type BotStatus       = 'idle' | 'running' | 'paused' | 'stopped' | 'error'
// Igual ao backend: faltavam scalper, alfha, over1_recovery e even_odd_recovery
export type BotStrategyType =
  | 'scalping' | 'martingale' | 'anti_martingale' | 'trend_following'
  | 'scalper' | 'alfha' | 'over1_recovery' | 'even_odd_recovery'
  | 'observador'
  | 'even-odd' | 'over-3' | 'over-1' | 'over3-under3' | 'under-8' | 'under8-over7'
export type TradeDirection  = 'CALL' | 'PUT'
export type LogLevel        = 'info' | 'warn' | 'error' | 'trade'

export type BotEventType =
  | 'bot:started'
  | 'bot:stopped'
  | 'bot:paused'
  | 'bot:resumed'
  | 'bot:error'
  | 'bot:trade_opened'
  | 'bot:trade_closed'
  | 'bot:stats_updated'
  | 'bot:log'
  | 'bot:goal_reached'
  | 'bot:insufficient_balance'

export interface BotEvent {
  type: BotEventType
  botId: string
  payload: Record<string, unknown>
}

export interface BotStats {
  totalTrades: number
  wins: number
  losses: number
  totalProfit: number
  totalLoss: number
  netPnL: number
  winRate: number
  currentStreak: number
  currentStake: number
  peakProfit: number
  maxDrawdown: number
}

export interface BotConfig {
  symbol: string
  contractType: string
  duration: number
  durationUnit: 'ticks' | 's' | 'm' | 'h' | 'd'
  initialStake: number
  currency: string
  maxTrades?: number
  maxLoss?: number
  maxProfit?: number
  strategyParams?: Record<string, unknown>
}

export interface BotLogEntry {
  timestamp: string
  level: LogLevel
  message: string
  data?: Record<string, unknown>
}

export interface BotSummary {
  id: string
  name: string
  strategy: BotStrategyType
  status: BotStatus
  stats: BotStats
  startedAt?: string
  stoppedAt?: string
}

export interface BotState extends BotSummary {
  config: BotConfig
  lastError?: string
  logs: BotLogEntry[]
}

export interface TradeClosedPayload {
  contractId: string
  profit: number
  won: boolean
  stake: number
  entryTick?: number
  exitTick?: number
  exitDigit?: number
  contractType?: string
}

// Os bots enviam campos diferentes conforme a estratégia:
// direction (CALL/PUT), side (Alfha), contractType (Even/Odd), barrier (dígitos)
export interface TradeOpenedPayload {
  contractId: string
  stake: number
  direction?: TradeDirection
  side?: string
  contractType?: string
  barrier?: number | string
}

// O servidor mudou o mercado de um bot (fechado/suspenso/indisponível na conta)
export interface SymbolFallbackInfo {
  from: string
  to: string
  reason?: string
}

export interface CatalogBot {
  id: string
  name: string
  description: string
  /** Uma linha, mostrada na lista de bots. */
  summary?: string
  strategy: BotStrategyType
  /** Valores por omissão do catálogo (pode estar vazio: os limites de risco não têm padrão). */
  defaultConfig: Partial<BotConfig>
  /** Campos do formulário: parâmetros do bot e limites de risco (vêm do servidor). */
  paramFields: StrategyFieldDef[]
  riskFields: StrategyFieldDef[]
  tags: string[]
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface Account {
  id: string
  account_id: string
  loginid: string
  full_name?: string
  name?: string
  balance: number | string
  currency: string
  is_virtual: boolean
  account_type: 'demo' | 'real'
  status?: string
  group?: string
}

export interface AccountLabels {
  realLabel: string
  demoLabel: string
}

// ── Notificações (broadcast, geridas no painel admin) ─────────
// Sem estado de "lida" por utilizador no backend — o frontend
// controla isso via localStorage (ver hooks/useNotifications.ts).
export interface AdminNotification {
  id: string
  title: string
  message: string
  createdAt: number
}

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

// ─── Campos de configuração de estratégia (UI) ───────────────

export interface StrategyFieldDef {
  key: string
  label: string
  type: 'number' | 'select' | 'toggle' | 'text'
  /** Sem valor por omissão (ex.: limites de risco): o utilizador tem de preencher. */
  defaultValue?: string | number | boolean
  /** `decimal` mantém o texto exato digitado (dinheiro nunca passa por vírgula flutuante). */
  valueType?: 'integer' | 'decimal'
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  description?: string
  /** Texto-guia dentro do campo vazio. */
  placeholder?: string
  group?: string
}

export const SYMBOL_OPTIONS = [
  { value: 'R_10', label: 'Volatility 10 Index' },
  { value: 'R_25', label: 'Volatility 25 Index' },
  { value: 'R_50', label: 'Volatility 50 Index' },
  { value: 'R_75', label: 'Volatility 75 Index' },
  { value: 'R_100', label: 'Volatility 100 Index' },
  { value: '1HZ10V', label: 'Volatility 10 (1s)' },
  { value: '1HZ100V', label: 'Volatility 100 (1s)' },
]

const CALL_PUT_OPTIONS = [
  { value: 'CALL', label: 'Rise (Call)' },
  { value: 'PUT', label: 'Fall (Put)' },
]

const DURATION_UNIT_OPTIONS = [
  { value: 'ticks', label: 'Ticks' },
  { value: 's', label: 'Segundos' },
]

function buildCommonFields(): StrategyFieldDef[] {
  return [
    { key: 'symbol', label: 'Símbolo', type: 'select', defaultValue: '1HZ100V', group: 'Contrato', options: SYMBOL_OPTIONS },
    { key: 'contractType', label: 'Tipo de Contrato', type: 'select', defaultValue: 'CALL', group: 'Contrato', options: CALL_PUT_OPTIONS },
    { key: 'duration', label: 'Duração', type: 'number', defaultValue: 5, min: 1, max: 60, step: 1, group: 'Contrato', description: 'Ticks: 1–10 recomendado. Segundos: 15–60.' },
    { key: 'durationUnit', label: 'Unidade', type: 'select', defaultValue: 'ticks', group: 'Contrato', options: DURATION_UNIT_OPTIONS },
    { key: 'initialStake', label: 'Stake Inicial (USD)', type: 'number', defaultValue: 1, min: 0.35, step: 0.01, group: 'Risco', description: 'Valor apostado no primeiro contrato (mín. $0.35)' },
    { key: 'maxLoss', label: 'Perda Máxima (USD)', type: 'number', defaultValue: 20, min: 1, step: 0.5, group: 'Risco', description: 'Para o bot quando a perda acumulada atingir este valor' },
    { key: 'maxProfit', label: 'Take Profit (USD)', type: 'number', defaultValue: 50, min: 1, step: 0.5, group: 'Risco', description: 'Para o bot quando o lucro acumulado atingir este valor' },
    { key: 'maxTrades', label: 'Máx. Trades (0 = ilimitado)', type: 'number', defaultValue: 0, min: 0, step: 1, group: 'Risco' },
  ]
}

export function getCommonConfigFields(_strategy: BotStrategyType): StrategyFieldDef[] {
  return buildCommonFields()
}

// As 4 estratégias novas ficam com lista vazia: o tipo agora cobre todas as
// estratégias que o backend envia e `STRATEGY_PARAMS_FIELDS[strategy]` deixa de
// ser `undefined` (era um possível erro ao abrir a configuração desses bots).
// A interface visual NÃO muda.
export const STRATEGY_PARAMS_FIELDS: Record<BotStrategyType, StrategyFieldDef[]> = {
  martingale: [
    { key: 'multiplier', label: 'Multiplicador', type: 'number', defaultValue: 2, min: 1.1, step: 0.1, group: 'Martingale', description: 'Fator de multiplicação do stake após perda' },
    { key: 'maxStake', label: 'Stake Máximo (USD)', type: 'number', defaultValue: 64, min: 1, step: 1, group: 'Martingale', description: 'Teto do stake para evitar apostas explosivas' },
    { key: 'resetOnWin', label: 'Modo Anti-Martingale', type: 'toggle', defaultValue: false, group: 'Martingale' },
  ],
  anti_martingale: [
    { key: 'multiplier', label: 'Multiplicador', type: 'number', defaultValue: 2, min: 1.1, step: 0.1, group: 'Anti-Martingale' },
    { key: 'maxStake', label: 'Stake Máximo (USD)', type: 'number', defaultValue: 64, min: 1, step: 1, group: 'Anti-Martingale' },
    { key: 'resetOnWin', label: 'Modo Anti-Martingale', type: 'toggle', defaultValue: true, group: 'Anti-Martingale' },
  ],
  scalping: [
    { key: 'maxConsecutiveLosses', label: 'Perdas Consecutivas Máx.', type: 'number', defaultValue: 3, min: 0, step: 1, group: 'Scalping', description: 'Pausa o bot após N perdas seguidas (0 = nunca pausar)' },
  ],
  trend_following: [
    { key: 'ticksWindow', label: 'Janela de Ticks', type: 'number', defaultValue: 20, min: 5, max: 100, step: 1, group: 'Trend' },
    { key: 'trendThreshold', label: 'Limiar de Tendência', type: 'number', defaultValue: 0.002, min: 0.0001, step: 0.0001, group: 'Trend' },
  ],
  scalper: [],
  alfha: [],
  over1_recovery: [],
  even_odd_recovery: [],
  observador: [],
  'even-odd': [], 'over-3': [], 'over-1': [], 'over3-under3': [], 'under-8': [], 'under8-over7': [],
}

export const STRATEGY_LABELS: Record<BotStrategyType, string> = {
  scalping: 'Scalping',
  martingale: 'Martingale',
  anti_martingale: 'Anti-Martingale',
  trend_following: 'Trend Following',
  scalper: 'Scalper',
  alfha: 'Alfha',
  over1_recovery: 'Over 1 Recovery',
  even_odd_recovery: 'Even/Odd Recovery',
  observador: 'Observador',
  'even-odd': 'Pares/Ímpares (inteligente)',
  'over-3': 'Scalper (Superior a 3)',
  'over-1': 'Ethereum (Superior a 1)',
  'over3-under3': 'Superior/Inferior a 3 (inteligente)',
  'under-8': 'Abaixo de 8 (Under 8)',
  'under8-over7': 'Abaixo de 8 / Acima de 7 (inteligente)',
}
