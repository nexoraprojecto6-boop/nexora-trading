// ============================================================
// NEXORA — Tipos e erros da API (sem dependência do ambiente)
// ============================================================
import type { Account, AccountLabels, AdminNotification } from './types'

export interface Strategy {
  id: string
  name: string
  description?: string
  isActive: boolean
}

export interface LocalUser {
  id: string
  fullName: string
  whatsapp: string
  email: string
  role: string
}

export interface AdminUserRow {
  id: string
  fullName: string
  whatsapp: string
  email: string
  role: 'user' | 'admin'
  status: 'active' | 'blocked'
  emailVerified: boolean
  createdAt: number
  lastLoginAt: number | null
  lastActiveAt: number | null
}

export interface AdminStats {
  total: number
  active: number
  inactive: number
  blocked: number
  verified: number
  unverified: number
  neverLoggedIn: number
  newToday: number
  onlineNow: number
  inactiveAfterDays: number
}

export interface MarkupStatisticsBreakdown {
  app_id: string
  app_markup_usd: number
  volume_usd: number
  payout_usd: number
  contract_count: number
  client_count: number
}

export interface MarkupCommissionSplit {
  kelvin: number
  platform: number
  kelvin_pct: number
  platform_pct: number
}

export interface MarkupStatisticsData {
  total_app_markup_usd: number
  total_volume_usd: number
  total_payout_usd: number
  total_contract_count: number
  total_client_count: number
  breakdown: MarkupStatisticsBreakdown[]
  date_from: string
  date_to: string
  commission_split: MarkupCommissionSplit
}

export interface MarkupStatisticsParams {
  month?: number
  year?: number
  dateFrom?: string
  dateTo?: string
}

export interface CreateNotificationPayload {
  title: string
  message: string
}

export type { AdminNotification }

export class DerivTokenExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DerivTokenExpiredError'
  }
}

/** Erro HTTP com o estado, o código da API e os erros por campo (validação). */
export class HttpError extends Error {
  status: number
  code?: string
  fieldErrors?: Record<string, string>
  constructor(message: string, status: number, code?: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export class FeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(`${feature} ainda não está disponível.`)
    this.name = 'FeatureUnavailableError'
  }
}

// ── Formas devolvidas pela API ──────────────────────────────

export interface ApiAccount {
  accountId: string
  accountType: 'demo' | 'real'
  currency: string
  status: 'active' | 'inactive'
  balance: number | null
}

export interface ApiParamDef {
  kind: 'integer' | 'decimal' | 'select' | 'symbol'
  key: string
  label: string
  help?: string
  min?: number | string
  max?: number | string
  options?: { value: string; label: string }[]
  default?: string | number
  placeholder?: string
}

export interface ApiBotDefinition {
  id: string
  name: string
  summary: string
  description: string
  params: ApiParamDef[]
  /** Limites próprios do bot; sem isto, valem os gerais. */
  riskParams?: ApiParamDef[]
}

export interface BotSettingsValues {
  params: Record<string, string | number>
  risk: Record<string, string | number>
}

export interface MyBotState {
  selectedBotId: string | null
  config: BotSettingsValues | null
}

export interface LiveBotStats {
  botId: string
  label: string
  status: 'idle' | 'running' | 'stopped'
  stopReason?: string
  lastError?: string
  trades: number
  wins: number
  losses: number
  winRate: number
  profit: number
  consecutiveLosses: number
  currentStake: number
  open?: { contractId: number; stake: number; at: number }
}

export interface LiveTrade {
  botId: string
  contractId: number
  contractType: string
  barrier?: number
  stake: number
  payout: number
  profit: number
  won: boolean
  latencyMs: number
  exitSpot?: string
  at: number
}

export interface LiveBots {
  accountId: string | null
  bots: LiveBotStats[]
  trades: LiveTrade[]
  totals: Record<string, { trades: number; wins: number; losses: number; profit: number; gain: number; loss: number }>
}

// ── Núcleo ──────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function toHttpError(body: unknown, status: number): HttpError {
  const err = isRecord(body) && isRecord(body.error) ? body.error : undefined
  const message = typeof err?.message === 'string' && err.message ? err.message : `Erro ${status}`
  const code = typeof err?.code === 'string' ? err.code : undefined
  const details = err && isRecord(err.details) ? err.details : undefined
  const raw = details && isRecord(details.errors) ? details.errors : undefined
  const fieldErrors = raw
    ? Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    : undefined
  return new HttpError(message, status, code, fieldErrors)
}

export function toAccount(a: ApiAccount): Account {
  return {
    id: a.accountId,
    account_id: a.accountId,
    loginid: a.accountId,
    balance: a.balance ?? 0,
    currency: a.currency,
    is_virtual: a.accountType === 'demo',
    account_type: a.accountType,
    status: a.status,
  }
}

