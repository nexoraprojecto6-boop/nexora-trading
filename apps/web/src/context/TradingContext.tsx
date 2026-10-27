// ============================================================
// NEXORA FOREX — Trading Context
//
// ÚNICA fonte de dados de mercado (balance, ticks, gráfico).
// Nunca abre WebSocket própria para a Deriv — todos os dados
// vêm do backend via BotsProvider/useNexoraWs. Isto evita o bug
// de ligações concorrentes à Deriv (limite de 5/conta) e dados
// de tick dessincronizados entre componentes.
//
// ALTERAÇÕES (compatibilidade com o backend):
//   • O último dígito usa o pip_size REAL do tick (antes: sempre 2
//     casas → dígito errado em R_10/R_25/R_50/R_75, que têm 3–4).
//   • Os ticks podem vir de vários mercados (bots diferentes, ou o
//     bot mudou de mercado). O gráfico segue UM mercado: o primeiro
//     que chega; só muda quando esse fica mudo (ex: mudança automática
//     de mercado), e nesse caso o histórico de dígitos recomeça.
//   • Vitória = lucro > 0 (antes: lucro 0 contava como vitória).
// ============================================================

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { decimalsFromPip } from '../lib/money'

export interface BarEntry {
  digit: number
  percentage: number
  isHighlight: boolean
  isLow: boolean
}

export interface Trade {
  id: string
  hora: string
  tipo: string
  tickFinal: number
  preco: string
  resultado: number
}

export interface BotStatusUi {
  isRunning: boolean
  currentStep: 'idle' | 'analyzing' | 'contract_open' | 'contract_closed'
}

export interface ChartData {
  barData: BarEntry[]
  lastDigit: number
}

interface TradingContextValue {
  balance: number
  profit: number
  wins: number
  losses: number
  currency: string
  lastDigit: number
  chartData: ChartData | null
  lastDigits: number[]
  tickCount: number
  isConnected: boolean
  loading: boolean

  selectedTicks: number
  setSelectedTicks: (t: number) => void

  trades: Trade[]
  clearTrades: () => void

  botStatus: BotStatusUi

  _setBalance: (b: number, c: string) => void
  _setTick: (quote: number, pipSize?: number, symbol?: string) => void
  _setBotStatus: (s: BotStatusUi) => void
  _addTrade: (t: Trade) => void
  _setConnected: (v: boolean) => void
}

const TradingContext = createContext<TradingContextValue | undefined>(undefined)

const MAX_DIGIT_HISTORY = 1000
const MAX_LAST_STRIP = 24
// Rede de segurança: se nenhum tick chegar neste intervalo, o
// loader do dashboard deixa de ficar preso para sempre (o status
// "offline" do indicador WS continua a refletir a realidade).
const LOADING_SAFETY_TIMEOUT_MS = 8000
// Um mercado só é trocado por outro se ficou sem ticks este tempo.
const SYMBOL_SWITCH_SILENCE_MS = 10_000

function computeBarData(digits: number[], windowSize: number): BarEntry[] {
  const slice = digits.slice(-windowSize)
  const counts = Array(10).fill(0)
  slice.forEach(d => counts[d]++)
  const total = slice.length || 1
  const pcts = counts.map(c => (c / total) * 100)
  const max = Math.max(...pcts)
  const min = Math.min(...pcts)
  return pcts.map((pct, digit) => ({ digit, percentage: pct, isHighlight: pct === max, isLow: pct === min }))
}

export function TradingProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState(0)
  const [currency, setCurrency] = useState('USD')
  const [profit, setProfit] = useState(0)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [lastDigit, setLastDigit] = useState(0)
  const [lastDigits, setLastDigits] = useState<number[]>([])
  const [tickCount, setTickCount] = useState(0)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedTicks, setSelectedTicks] = useState(100)
  const [trades, setTrades] = useState<Trade[]>([])
  const [botStatus, setBotStatus] = useState<BotStatusUi>({ isRunning: false, currentStep: 'idle' })

  const digitHistory = useRef<number[]>([])
  const selectedTicksRef = useRef(selectedTicks)
  const symbolRef = useRef<string | null>(null)
  const lastTickAtRef = useRef(0)
  useEffect(() => { selectedTicksRef.current = selectedTicks }, [selectedTicks])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), LOADING_SAFETY_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [])

  const _setBalance = useCallback((b: number, c: string) => {
    setBalance(b)
    setCurrency(c)
    // O saldo chegou: o cartão deixa de mostrar "A carregar…" (antes só os ticks faziam isto).
    setLoading(false)
  }, [])

  const _setTick = useCallback((quote: number, pipSize?: number, symbol?: string) => {
    const now = Date.now()

    // Segue um só mercado (ver comentário no topo do ficheiro)
    if (symbol) {
      if (symbolRef.current === null) {
        symbolRef.current = symbol
      } else if (symbol !== symbolRef.current) {
        if (now - lastTickAtRef.current < SYMBOL_SWITCH_SILENCE_MS) return
        symbolRef.current = symbol
        digitHistory.current = []
        setLastDigits([])
      }
    }
    lastTickAtRef.current = now

    // pip_size real do símbolo (2, 3 ou 4 casas) — mantém zeros finais
    const priceStr = quote.toFixed(decimalsFromPip(pipSize, 2))
    const digit = parseInt(priceStr[priceStr.length - 1], 10)
    if (Number.isNaN(digit)) return

    digitHistory.current.push(digit)
    if (digitHistory.current.length > MAX_DIGIT_HISTORY) {
      digitHistory.current = digitHistory.current.slice(-MAX_DIGIT_HISTORY)
    }
    setLastDigit(digit)
    setLoading(false)
    setTickCount(c => c + 1)
    setLastDigits(prev => {
      const next = [...prev, digit]
      return next.length > MAX_LAST_STRIP ? next.slice(-MAX_LAST_STRIP) : next
    })
    const w = selectedTicksRef.current
    queueMicrotask(() => {
      setChartData({ barData: computeBarData(digitHistory.current, w), lastDigit: digit })
    })
  }, [])

  const _setBotStatus = useCallback((s: BotStatusUi) => setBotStatus(s), [])

  const _addTrade = useCallback((t: Trade) => {
    setTrades(prev => [t, ...prev].slice(0, 500))
    if (t.resultado > 0) {
      setWins(w => w + 1)
      setProfit(p => p + t.resultado)
    } else {
      setLosses(l => l + 1)
      setProfit(p => p + t.resultado)
    }
  }, [])

  const _setConnected = useCallback((v: boolean) => setIsConnected(v), [])

  const clearTrades = useCallback(() => {
    setTrades([])
    setWins(0)
    setLosses(0)
    setProfit(0)
  }, [])

  return (
    <TradingContext.Provider value={{
      balance, profit, wins, losses, currency, lastDigit, chartData,
      lastDigits, tickCount, isConnected, loading, selectedTicks, setSelectedTicks,
      trades, clearTrades, botStatus,
      _setBalance, _setTick, _setBotStatus, _addTrade, _setConnected,
    }}>
      {children}
    </TradingContext.Provider>
  )
}

export function useTrading() {
  const ctx = useContext(TradingContext)
  if (!ctx) throw new Error('useTrading must be used inside <TradingProvider>')
  return ctx
}
