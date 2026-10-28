// ============================================================
// NEXORA — Cliente da API (fábrica com base e fetch injetáveis, para testes)
//
// Autenticação por cookie de sessão HttpOnly (o browser envia-o sozinho com
// `credentials: 'include'`): o frontend nunca vê nem guarda tokens.
// ============================================================
import { DEFAULT_ACCOUNT_LABELS } from './config'
import {
  FeatureUnavailableError, HttpError, toAccount, toHttpError,
  type AdminNotification, type AdminStats, type AdminUserRow, type ApiAccount, type ApiBotDefinition, type ApiParamDef,
  type BotSettingsValues, type CreateNotificationPayload, type LiveBots, type MarkupStatisticsData, type MarkupStatisticsParams, type MyBotState,
} from './apiTypes'
import type { Account, AccountLabels } from './types'

export function createApi(base: string | undefined, fetchFn: typeof fetch = (...args) => fetch(...args)) {
  async function request<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<T> {
    if (base === undefined) {
      throw new HttpError('Configuração em falta: VITE_API_BASE_URL.', 0, 'CONFIG')
    }
    let response: Response
    try {
      response = await fetchFn(`${base}${path}`, {
        method: init.method ?? 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      })
    } catch {
      throw new HttpError('Não foi possível contactar o servidor.', 0, 'NETWORK')
    }
    if (response.status === 204) return undefined as T
    const body: unknown = await response.json().catch(() => undefined)
    if (!response.ok) throw toHttpError(body, response.status)
    return body as T
  }


  return {

    /** Endereço (da API) que inicia o login. É uma navegação de página inteira, não um fetch. */
    loginUrl(prompt?: 'registration'): string {
      return `${base ?? ''}/auth/login${prompt ? `?prompt=${prompt}` : ''}`
    },

    async getMe(): Promise<{ user: { id: string } }> {
      return request('/me')
    },

    /** Contas com saldo. `live=false`: o token da Deriv expirou (saldos indisponíveis). */
    async getAccounts(): Promise<{ live: boolean; accounts: Account[] }> {
      const res = await request<{ live: boolean; accounts: ApiAccount[] }>('/me/accounts')
      return { live: res.live === true, accounts: (res.accounts ?? []).map(toAccount) }
    },

    async logout(): Promise<void> {
      await request('/auth/logout', { method: 'POST' })
    },

    async getOnlineCount(): Promise<{ count: number }> {
      return request('/online-count')
    },

    // ── Bots ────────────────────────────────────────────────────
    async getBots(): Promise<{ bots: ApiBotDefinition[]; riskParams: ApiParamDef[] }> {
      return request('/bots')
    },
    async getMyBot(): Promise<MyBotState> {
      return request('/me/bot')
    },
    async selectBot(botId: string): Promise<void> {
      await request('/me/bot/selection', { method: 'PUT', body: { botId } })
    },
    async saveBotConfig(botId: string, values: BotSettingsValues): Promise<{ config: BotSettingsValues }> {
      return request('/me/bot/config', { method: 'PUT', body: { botId, params: values.params, risk: values.risk } })
    },

    // ── Execução ────────────────────────────────────────────────
    async warmUpBots(accountId: string): Promise<void> {
      await request('/me/bots/warmup', { method: 'POST', body: { accountId } })
    },
    async startBotRun(botId: string, accountId: string): Promise<void> {
      await request(`/me/bots/${encodeURIComponent(botId)}/start`, { method: 'POST', body: { accountId } })
    },
    async stopBotRun(botId: string): Promise<void> {
      await request(`/me/bots/${encodeURIComponent(botId)}/stop`, { method: 'POST' })
    },
    async clearBotHistory(): Promise<void> {
      await request('/me/bots/clear-history', { method: 'POST' })
    },
    async getBotsLive(): Promise<LiveBots> {
      return request('/me/bots/live')
    },

    // ── Ainda sem servidor (mantidos para as páginas continuarem a compilar) ──
    async getAccountLabels(): Promise<AccountLabels> {
      return { ...DEFAULT_ACCOUNT_LABELS }
    },
    async getNotifications(): Promise<{ success: boolean; notifications: AdminNotification[] }> {
      return { success: true, notifications: [] }
    },
    async getAdminStats(): Promise<{ success: boolean; stats: AdminStats }> {
      throw new FeatureUnavailableError('O painel de administração')
    },
    async getAdminUsers(): Promise<{ success: boolean; users: AdminUserRow[]; total: number }> {
      throw new FeatureUnavailableError('O painel de administração')
    },
    async setUserStatus(_id: string, _status: 'active' | 'blocked'): Promise<{ success: boolean; user: AdminUserRow }> {
      throw new FeatureUnavailableError('O painel de administração')
    },
    async getMarkupStatistics(_params: MarkupStatisticsParams): Promise<MarkupStatisticsData> {
      throw new FeatureUnavailableError('O relatório de comissões')
    },
    async getAdminNotifications(): Promise<{ success: boolean; notifications: AdminNotification[] }> {
      throw new FeatureUnavailableError('A gestão de avisos')
    },
    async createNotification(_payload: CreateNotificationPayload): Promise<{ success: boolean; notification: AdminNotification }> {
      throw new FeatureUnavailableError('A gestão de avisos')
    },
    async deleteNotification(_id: string): Promise<{ success: boolean }> {
      throw new FeatureUnavailableError('A gestão de avisos')
    },

  }
}

export type Api = ReturnType<typeof createApi>
