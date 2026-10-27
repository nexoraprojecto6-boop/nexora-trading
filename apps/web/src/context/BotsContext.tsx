// ============================================================
// NEXORA — Bots Context
//
// Mesma interface que os componentes do painel já usavam, mas ligada ao servidor
// novo: o catálogo, a escolha e a configuração vêm da API.
//
// IMPORTANTE: o servidor ainda NÃO executa operações. O único bot do catálogo
// ("Observador") só acompanha o mercado e não abre operações; o "Play" apenas
// mostra esse estado no painel. Compra manual, histórico real e comandos de
// administração ficam desligados até existir servidor.
// ============================================================
import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import type { BotSummary, BotState, BotLogEntry, BotConfig, BotStrategyType, CatalogBot, WsStatus } from '../lib/types'
import type { ManualBuyParams } from '../hooks/useNexoraWs'
import { api, HttpError, type BotSettingsValues } from '../lib/api'
import { toCatalogBot } from '../lib/mappers'
import { useAuth } from './AuthContext'
import { useTrading } from './TradingContext'

export interface TradeRecord {
  id: string
  hora: string
  botId: string
  botName: string
  strategy: string
  stake: number
  profit: number
  won: boolean
  timestamp: number
  pending?: boolean
  direction?: string
  contractType?: string
  exitTick?: number
  exitDigit?: number
  /** Preço de saída, como texto exato (a tabela mostra o último dígito). */
  exitSpot?: string
}

export interface ManualTradeRecord {
  id: string
  hora: string
  stake: number
  profit: number
  won: boolean
  timestamp: number
  pending: boolean
  contractType: string
  exitDigit?: number
}

export interface StatusMessage {
  text: string
  kind: 'success' | 'warning' | 'error' | 'info'
  /** Com título, o NotificationBar mostra este texto em vez dos textos fixos de cada tipo. */
  title?: string
}

export type SaveConfigResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors: Record<string, string> }

interface BotsCtx {
  catalogBots: CatalogBot[]
  isLoadingCatalog: boolean
  sessionBots: BotSummary[]
  botStates: Record<string, BotState>
  wsStatus: WsStatus
  lastError: string | null
  statusMessage: StatusMessage | null
  trades: TradeRecord[]
  botTrades: Record<string, TradeRecord[]>
  openTrades: Record<string, TradeRecord>
  botLogs: Record<string, BotLogEntry[]>
  listCatalogBots: () => void
  listSessionBots: () => void
  /** Devolve `false` se o arranque foi recusado (ex.: falta configurar): o painel não fica a "iniciar". */
  startCatalogBot: (catalogBotId: string, sessionName?: string, configOverride?: Partial<BotConfig>) => boolean
  stopBot: (botId: string) => void
  pauseBot: (botId: string) => void
  resumeBot: (botId: string) => void
  deleteBot: (botId: string) => void
  getBotLogs: (botId: string, limit?: number) => void
  clearTrades: () => void
  adminAddCatalogBot: (dto: { name: string; description: string; strategy: BotStrategyType; defaultConfig: BotConfig; tags?: string[]; isActive?: boolean }) => void
  adminRemoveCatalogBot: (id: string) => void
  adminUpdateCatalogBot: (id: string, updates: Record<string, unknown>) => void
  manualBuy: (params: ManualBuyParams) => void
  manualPendingTrade: ManualTradeRecord | null
  manualTrades: ManualTradeRecord[]
  manualBuyError: string | null
  // ── Novo: escolha e configuração guardadas no servidor ──
  selectedBotId: string | null
  savedConfig: BotSettingsValues | null
  selectBot: (botId: string) => Promise<void>
  saveBotConfig: (botId: string, values: BotSettingsValues) => Promise<SaveConfigResult>
}

const Ctx = createContext<BotsCtx | null>(null)
/** Contexto exposto só para testes (permite injetar um estado). */
export const BotsContext = Ctx
export type BotsContextValue = BotsCtx

export function useBots() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useBots must be used inside BotsProvider')
  return c
}

const MESSAGE_MS = 7000
const ZERO_STATS = {
  totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, totalLoss: 0, netPnL: 0,
  winRate: 0, currentStreak: 0, currentStake: 0, peakProfit: 0, maxDrawdown: 0,
}
const UNAVAILABLE = 'Esta funcionalidade ainda não está disponível.'

export function BotsProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, currentAccount, derivLive } = useAuth()
  const { _setBalance, _setConnected } = useTrading()

  const [catalogBots, setCatalogBots] = useState<CatalogBot[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null)
  const [savedConfig, setSavedConfig] = useState<BotSettingsValues | null>(null)
  const [sessionBots, setSessionBots] = useState<BotSummary[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const [manualBuyError, setManualBuyError] = useState<string | null>(null)
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((msg: StatusMessage) => {
    setStatusMessage(msg)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setStatusMessage(null), MESSAGE_MS)
  }, [])
  useEffect(() => () => { if (msgTimer.current) clearTimeout(msgTimer.current) }, [])

  // ── Catálogo e estado do utilizador ──
  const load = useCallback(async () => {
    setIsLoadingCatalog(true)
    try {
      const [cat, mine] = await Promise.all([api.getBots(), api.getMyBot()])
      setCatalogBots(cat.bots.map(b => toCatalogBot(b, cat.riskParams)))
      setSelectedBotId(mine.selectedBotId)
      setSavedConfig(mine.config)
      setLastError(null)
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 401)) setLastError('Não foi possível carregar os bots.')
    } finally {
      setIsLoadingCatalog(false)
    }
  }, [])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) { setIsLoadingCatalog(false); return }
    void load()
  }, [isLoading, isAuthenticated, load])

  // ── Saldo e estado da ligação à Deriv (alimentam o BalanceCard e o rodapé) ──
  const balance = currentAccount?.balance
  const currency = currentAccount?.currency
  useEffect(() => {
    if (balance === undefined || currency === undefined) return
    _setBalance(Number(balance), currency)
  }, [balance, currency, _setBalance])
  useEffect(() => { _setConnected(isAuthenticated && derivLive) }, [isAuthenticated, derivLive, _setConnected])

  const wsStatus: WsStatus = isAuthenticated && derivLive ? 'connected' : 'disconnected'

  // ── Escolha e configuração ──
  const selectBot = useCallback(async (botId: string) => {
    const previous = selectedBotId
    setSelectedBotId(botId)
    setSavedConfig(null)
    try {
      await api.selectBot(botId)
      const mine = await api.getMyBot()
      setSelectedBotId(mine.selectedBotId)
      setSavedConfig(mine.config)
    } catch (e) {
      setSelectedBotId(previous)
      notify({ kind: 'error', title: 'Não foi possível escolher o bot', text: e instanceof HttpError ? e.message : 'Tente novamente.' })
    }
  }, [selectedBotId, notify])

  const saveBotConfig = useCallback(async (botId: string, values: BotSettingsValues): Promise<SaveConfigResult> => {
    try {
      const res = await api.saveBotConfig(botId, values)
      setSavedConfig(res.config)
      return { ok: true }
    } catch (e) {
      if (e instanceof HttpError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors ?? {} }
      return { ok: false, message: 'Não foi possível guardar. Tente novamente.', fieldErrors: {} }
    }
  }, [])

  // ── Execução (só estado local do Observador; nada é enviado à corretora) ──
  const patchBot = useCallback((id: string, status: BotSummary['status']) => {
    setSessionBots(prev => prev.map(b => (b.id === id ? { ...b, status, ...(status === 'stopped' ? { stoppedAt: new Date().toISOString() } : {}) } : b)))
  }, [])

  const startCatalogBot = useCallback((catalogBotId: string, sessionName?: string): boolean => {
    const bot = catalogBots.find(b => b.id === catalogBotId)
    if (!bot) return false
    if (selectedBotId !== catalogBotId || !savedConfig) {
      notify({ kind: 'info', title: 'Falta configurar', text: 'Abra as Configurações e guarde os parâmetros e os limites de risco antes de iniciar.' })
      return false
    }
    if (!derivLive) {
      notify({ kind: 'error', title: 'Ligação à Deriv expirada', text: 'Termine a sessão e entre de novo com a Deriv.' })
      return false
    }
    const id = `local-${catalogBotId}`
    setSessionBots(prev => [
      ...prev.filter(b => b.id !== id),
      { id, name: sessionName ?? bot.name, strategy: bot.strategy, status: 'running', stats: { ...ZERO_STATS }, startedAt: new Date().toISOString() },
    ])
    notify({ kind: 'info', title: `${bot.name} ativo`, text: 'Acompanha o mercado e não abre operações.' })
    return true
  }, [catalogBots, selectedBotId, savedConfig, derivLive, notify])

  const stopBot = useCallback((id: string) => patchBot(id, 'stopped'), [patchBot])
  const pauseBot = useCallback((id: string) => patchBot(id, 'paused'), [patchBot])
  const resumeBot = useCallback((id: string) => patchBot(id, 'running'), [patchBot])
  const deleteBot = useCallback((id: string) => setSessionBots(prev => prev.filter(b => b.id !== id)), [])

  const unavailable = useCallback(() => notify({ kind: 'info', title: 'Indisponível', text: UNAVAILABLE }), [notify])
  const manualBuy = useCallback((_params: ManualBuyParams) => {
    setManualBuyError('A compra manual ainda não está disponível.')
    setTimeout(() => setManualBuyError(null), MESSAGE_MS)
  }, [])

  const noop = useCallback(() => {}, [])

  return (
    <Ctx.Provider value={{
      catalogBots, isLoadingCatalog, sessionBots, botStates: {}, wsStatus, lastError, statusMessage,
      trades, botTrades: {}, openTrades: {}, botLogs: {},
      listCatalogBots: () => { void load() }, listSessionBots: noop,
      startCatalogBot, stopBot, pauseBot, resumeBot, deleteBot,
      getBotLogs: noop, clearTrades: () => setTrades([]),
      adminAddCatalogBot: unavailable, adminRemoveCatalogBot: unavailable, adminUpdateCatalogBot: unavailable,
      manualBuy, manualPendingTrade: null, manualTrades: [], manualBuyError,
      selectedBotId, savedConfig, selectBot, saveBotConfig,
    }}>
      {children}
    </Ctx.Provider>
  )
}
