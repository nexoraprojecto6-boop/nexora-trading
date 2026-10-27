// ============================================================
// NEXORA FOREX — OperarManualPage
//
// Réplica do layout Over/Under do dtrader.deriv.com.
// Gráfico e percentagens: MESMA lógica do ChartSection.tsx
// (ligação pública direta à Deriv — não passa pelo backend).
// Compra: usa useBots().manualBuy() (backend, via useNexoraWs).
// Mercados: Over / Under / Matches / Differs
// (DIGITOVER / DIGITUNDER / DIGITMATCH / DIGITDIFF).
// Saldo em tempo real via useTrading; histórico via <TradesTable/>.
// Página auto-contida: monta o seu próprio <BotsProvider/>.
//
// LAYOUT RESPONSIVO:
//   - Desktop (>=860px): 2 colunas, 100dvh fixo; só o histórico rola.
//   - Mobile (<860px): 1 coluna (gráfico → painel → histórico).
//     A página só rola se a soma não couber no ecrã — nada é cortado.
//   - <380px: duração/stake/comprar empilham em coluna.
// Nenhuma lógica de dados/estado foi alterada.
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { IoArrowBack, IoSwapHorizontal, IoChevronDown, IoCheckmark, IoClose } from 'react-icons/io5'
import { BotsProvider, useBots } from '../context/BotsContext'
import { useTrading } from '../context/TradingContext'
import { useAuth } from '../context/AuthContext'
import { useLoader } from '../context/LoaderContext'
import { TradesTable } from '../components/TradesTable'
import { api } from '../lib/api'
import type { ManualBuyParams } from '../hooks/useNexoraWs'

const PUBLIC_WS    = 'wss://api.derivws.com/trading/v1/options/ws/public'
const HISTORY_LOAD = 1000
const ANIM_MS       = 300
const PING_MS       = 25_000
const RECONNECT_MS  = 2_500

const COLOR_HOT     = '#2e7d32'
const COLOR_COLD    = '#c62828'
const COLOR_NEUTRAL = '#b8bcc8'

const SYMBOLS = [
  { value: '1HZ100V', label: 'Vol 100 (1s)' },
  { value: '1HZ10V',  label: 'Vol 10 (1s)'  },
  { value: 'R_100',   label: 'Vol 100'       },
  { value: 'R_75',    label: 'Vol 75'        },
  { value: 'R_50',    label: 'Vol 50'        },
  { value: 'R_25',    label: 'Vol 25'        },
  { value: 'R_10',    label: 'Vol 10'        },
]
const WINDOWS = [25, 50, 100, 250, 500, 1000]
const DURATIONS = [1, 2, 3, 5, 10]

// ── Mercados suportados ──────────────────────────────────────
type MarketType = 'over' | 'under' | 'matches' | 'differs'

const MARKET_LABELS: Record<MarketType, string> = {
  over: 'Over', under: 'Under', matches: 'Matches', differs: 'Differs',
}

const MARKET_CONTRACT: Record<MarketType, ManualBuyParams['contractType']> = {
  over: 'DIGITOVER',
  under: 'DIGITUNDER',
  matches: 'DIGITMATCH',
  differs: 'DIGITDIFF',
}

// A Deriv rejeita propostas impossíveis: "over 9" e "under 0" nunca
// podem ganhar, por isso não estão disponíveis como barreira válida.
function isDigitValidForMarket(market: MarketType, digit: number): boolean {
  if (market === 'over') return digit <= 8
  if (market === 'under') return digit >= 1
  return true // matches / differs aceitam qualquer dígito 0–9
}

// ── Portal: monta o conteúdo direto no <body>, fora de qualquer
// container com overflow/scroll ───────────────────────────────
function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body)
}

function lastDigit(q: number): number {
  const s = q.toFixed(2)
  return parseInt(s[s.length - 1], 10)
}

function calcAll(hist: number[], win: number) {
  const slice  = hist.slice(-win)
  const n      = slice.length || 1
  const counts = Array(10).fill(0) as number[]
  slice.forEach(d => { counts[d]++ })
  const pcts   = counts.map(c => (c / n) * 100)
  const maxPct = Math.max(...pcts)
  const minPct = Math.min(...pcts)
  return { pcts, maxPct, minPct, total: slice.length }
}

// Estilo comum dos campos do painel
const fieldStyle: React.CSSProperties = {
  background: 'var(--bg-card-hi)', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '8px 10px', fontSize: 14, width: '100%', minHeight: 40,
  fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
}

function OperarManualInner() {
  const navigate = useNavigate()
  const { manualBuy, manualPendingTrade, manualBuyError, manualTrades } = useBots()
  const { balance, currency, profit, wins, losses, loading: tradingLoading } = useTrading()

  // ── Troca de conta (Real/Demo) — MESMA lógica do ControlsSection.tsx ──
  const { accounts, currentAccount, setCurrentAccount, localUser } = useAuth()
  const loader = useLoader()
  const isAdmin = localUser?.role === 'admin'

  const [accLabels, setAccLabels] = useState({ realLabel: 'REAL', demoLabel: 'DEMO' })
  useEffect(() => { api.getAccountLabels().then(setAccLabels).catch(() => {}) }, [])

  // Para administradores, os nomes ficam trocados/explícitos — mesma
  // regra do ControlsSection (Demo→"Virtual"/verde, Real→"Ao Vivo"/azul).
  const demoLabelDisplay = (isAdmin ? 'REAL' : accLabels.demoLabel).toUpperCase()
  const realLabelDisplay = (isAdmin ? 'DEMO' : accLabels.realLabel).toUpperCase()
  const demoColorDisplay = isAdmin ? 'var(--green)' : 'var(--blue-hi)'
  const realColorDisplay = isAdmin ? 'var(--blue-hi)' : 'var(--green)'

  const accLabel = !currentAccount ? 'Selecionar' : currentAccount.is_virtual ? demoLabelDisplay : realLabelDisplay
  const accColor = !currentAccount ? 'var(--text-faint)' : currentAccount.is_virtual ? demoColorDisplay : realColorDisplay

  const [showAccSheet, setShowAccSheet] = useState(false)
  const [switchingAcc, setSwitchingAcc] = useState(false)

  const handleAccSelectSheet = async (acc: typeof accounts[number]) => {
    if (currentAccount?.account_id === acc.account_id) { setShowAccSheet(false); return }
    setSwitchingAcc(true)
    const label = acc.is_virtual ? `Conta ${demoLabelDisplay}` : `Conta ${realLabelDisplay}`
    loader.show(`A ligar a ${label}…`)
    try {
      await setCurrentAccount(acc)
      loader.complete(`${label} activa!`)
    } catch {
      loader.hide()
    } finally {
      setSwitchingAcc(false)
      setShowAccSheet(false)
    }
  }

  // ── Sinal WIN/LOSS sobre o dígito onde a última operação
  // manual terminou. `manualTrades` vem com o mais recente em primeiro.
  const [lastResult, setLastResult] = useState<{ id: string; digit: number; won: boolean } | null>(null)
  const lastResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const latest = manualTrades[0]
    if (!latest || typeof latest.exitDigit !== 'number') return
    if (lastResult?.id === latest.id) return // já mostrado, evita reiniciar o timer

    setLastResult({ id: latest.id, digit: latest.exitDigit, won: latest.won })

    if (lastResultTimerRef.current) clearTimeout(lastResultTimerRef.current)
    lastResultTimerRef.current = setTimeout(() => {
      setLastResult(prev => (prev?.id === latest.id ? null : prev))
    }, 6000)
  }, [manualTrades]) // eslint-disable-line

  useEffect(() => {
    return () => { if (lastResultTimerRef.current) clearTimeout(lastResultTimerRef.current) }
  }, [])

  // ── Estado do gráfico / dígitos (idêntico ao ChartSection) ──
  const [symbol, setSymbol] = useState('1HZ100V')
  const [win, setWin] = useState(25)
  const [phase, setPhase] = useState<'connecting' | 'loading' | 'live' | 'error'>('connecting')
  const [tkCnt, setTkCnt] = useState(0)
  const [info, setInfo] = useState(() => calcAll([], 25))
  const [bars, setBars] = useState<number[]>(Array(10).fill(0))
  const [winOpen, setWinOpen] = useState(false)

  const hist = useRef<number[]>([])
  const target = useRef<number[]>(Array(10).fill(0))
  const current = useRef<number[]>(Array(10).fill(0))
  const animating = useRef(false)
  const animStart = useRef<number[]>(Array(10).fill(0))
  const animT0 = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const winRef = useRef(win)
  const symRef = useRef(symbol)
  winRef.current = win
  symRef.current = symbol

  const startRaf = useCallback(() => {
    animStart.current = [...current.current]
    animT0.current = performance.now()
    if (animating.current) return
    animating.current = true
    const tick = (now: number) => {
      if (!mounted.current) { animating.current = false; return }
      const p = Math.min(1, (now - animT0.current) / ANIM_MS)
      const s = animStart.current, t = target.current, c = current.current
      for (let i = 0; i < 10; i++) c[i] = s[i] + (t[i] - s[i]) * p
      setBars([...c])
      if (p < 1) requestAnimationFrame(tick)
      else animating.current = false
    }
    requestAnimationFrame(tick)
  }, [])

  const applyPcts = useCallback((pcts: number[], snap = false) => {
    target.current = [...pcts]
    if (snap) { current.current = [...pcts]; setBars([...pcts]) }
    else startRaf()
  }, [startRaf])

  const onTick = useCallback((price: number) => {
    const d = lastDigit(price)
    hist.current.push(d)
    if (hist.current.length > 5000) hist.current = hist.current.slice(-5000)
    const all = calcAll(hist.current, winRef.current)
    applyPcts(all.pcts, false)
    setInfo(all)
    setTkCnt(hist.current.length)
    setPhase('live')
  }, [applyPcts])

  const connect = useCallback((sym: string) => {
    if (pingRef.current) clearInterval(pingRef.current)
    if (reconnRef.current) clearTimeout(reconnRef.current)
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }

    setPhase('connecting')
    const ws = new WebSocket(PUBLIC_WS)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mounted.current) { ws.close(); return }
      setPhase('loading')
      ws.send(JSON.stringify({ ticks_history: sym, end: 'latest', count: HISTORY_LOAD, style: 'ticks', req_id: 1 }))
      ws.send(JSON.stringify({ ticks: sym, subscribe: 1, req_id: 2 }))
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }))
      }, PING_MS)
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string)
      if (msg.error) return
      if (msg.msg_type === 'history' && Array.isArray(msg.history?.prices)) {
        hist.current = (msg.history.prices as number[]).map(lastDigit)
        const all = calcAll(hist.current, winRef.current)
        applyPcts(all.pcts, true)
        setInfo(all)
        setTkCnt(hist.current.length)
        setPhase('live')
        return
      }
      if (msg.msg_type === 'tick' && msg.tick?.quote != null) onTick(msg.tick.quote as number)
    }

    ws.onerror = () => { if (mounted.current) setPhase('error') }
    ws.onclose = () => {
      if (!mounted.current) return
      if (pingRef.current) clearInterval(pingRef.current)
      reconnRef.current = setTimeout(() => connect(symRef.current), RECONNECT_MS)
    }
  }, [applyPcts, onTick])

  useEffect(() => {
    hist.current = []
    target.current = Array(10).fill(0)
    current.current = Array(10).fill(0)
    setBars(Array(10).fill(0))
    setTkCnt(0)
    setInfo(calcAll([], win))
    connect(symbol)
  }, [symbol]) // eslint-disable-line

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (pingRef.current) clearInterval(pingRef.current)
      if (reconnRef.current) clearTimeout(reconnRef.current)
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }
    }
  }, [])

  useEffect(() => {
    if (hist.current.length === 0) return
    const all = calcAll(hist.current, win)
    applyPcts(all.pcts, false)
    setInfo(all)
  }, [win, applyPcts])

  // ── Estado do painel de operação ─────────────────────────────
  const [market, setMarket] = useState<MarketType>('over')
  const [selectedDigit, setSelectedDigit] = useState(5)
  const [duration, setDuration] = useState(2)
  const [stake, setStake] = useState(2)
  const [localError, setLocalError] = useState<string | null>(null)

  const isBusy = !!manualPendingTrade
  const maxBar = Math.max(...bars, 10)

  // Se o mercado mudar para um em que o dígito seleccionado deixa
  // de ser válido, ajusta para o dígito válido mais próximo.
  useEffect(() => {
    if (!isDigitValidForMarket(market, selectedDigit)) {
      setSelectedDigit(market === 'over' ? 8 : market === 'under' ? 1 : selectedDigit)
    }
  }, [market]) // eslint-disable-line

  function getBarColor(pct: number): string {
    if (Math.abs(pct - info.maxPct) < 0.01) return COLOR_HOT
    if (Math.abs(pct - info.minPct) < 0.01) return COLOR_COLD
    return COLOR_NEUTRAL
  }

  const handleBuy = () => {
    if (isBusy) return
    if (!isDigitValidForMarket(market, selectedDigit)) {
      setLocalError(market === 'over' ? 'Over não aceita o dígito 9.' : 'Under não aceita o dígito 0.')
      setTimeout(() => setLocalError(null), 4000)
      return
    }
    if (stake < 0.35) {
      setLocalError('Stake mínimo é $0.35.')
      setTimeout(() => setLocalError(null), 4000)
      return
    }
    setLocalError(null)
    const params: ManualBuyParams = {
      symbol,
      contractType: MARKET_CONTRACT[market],
      duration,
      durationUnit: 'ticks',
      stake,
      barrier: selectedDigit,
    }
    manualBuy(params)
  }

  const displayError = localError ?? manualBuyError

  return (
    <div className="op-page">
      <div className="op-topbar">
        <button
          onClick={() => navigate(-1)}
          className="op-back-btn"
        >
          <IoArrowBack size={16} />
          Voltar ao Dashboard
        </button>
      </div>

      {/* ── Saldo / P&L do dia — faixa fina, sempre em linha horizontal ── */}
      <div className="card op-balance-card" style={{ opacity: tradingLoading ? 0.6 : 1 }}>
        <div className="op-stat">
          <p className="op-stat-label">Saldo</p>
          <p className="op-stat-value" style={{ color: 'var(--white)' }}>
            {balance.toFixed(2)} <span className="op-stat-unit">{currency}</span>
          </p>
        </div>
        <div className="op-stat">
          <p className="op-stat-label">Lucro/Prejuízo</p>
          <p className="op-stat-value" style={{ color: profit >= 0 ? '#22c55e' : '#ff5c5c' }}>
            {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
          </p>
        </div>
        <div className="op-stat">
          <p className="op-stat-label">Operações</p>
          <p className="op-stat-value">
            <span style={{ color: '#22c55e' }}>{wins}</span>
            <span style={{ color: 'var(--text-dim)' }}> / </span>
            <span style={{ color: '#e8e8ec' }}>{losses}</span>
          </p>
        </div>

        {/* ── Trocar de conta (Real/Demo) — ponta direita do card ── */}
        <button onClick={() => setShowAccSheet(true)} className="btn-ghost op-acc-btn" aria-label="Trocar de conta">
          <span className="op-acc-label" style={{ color: accColor }}>{accLabel}</span>
          <span className="op-acc-icon">
            <IoSwapHorizontal size={14} />
          </span>
        </button>
      </div>

      {/* ── Corpo principal ── */}
      <div className="op-main">
        <div className="op-left">
          {/* ---------------- Gráfico + dígitos ---------------- */}
          <div className="card op-chart-card">
            <div className="op-chart-head">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                style={{ ...fieldStyle, width: 'auto', minHeight: 36, padding: '6px 10px', fontSize: 13 }}
              >
                {SYMBOLS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: phase === 'live' ? '#3ddc84' : phase === 'error' ? '#ff5c5c' : '#e0a63d',
              }} />
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {phase === 'live' ? 'Ligado' : phase === 'error' ? 'Erro' : 'A ligar…'}
              </span>

              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                {phase === 'loading' ? '...' : <><span className="tabular">{Math.min(info.total, win)}</span> ticks</>}
              </span>

              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setWinOpen(o => !o)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '6px 10px', minHeight: 36, fontSize: 12, cursor: 'pointer' }}
                >
                  {win} <IoChevronDown size={12} />
                </button>
                {winOpen && (
                  <div className="card" style={{ position: 'absolute', top: '110%', right: 0, zIndex: 30, padding: 4, minWidth: 90 }}>
                    {WINDOWS.map(w => (
                      <button
                        key={w}
                        onClick={() => { setWin(w); setWinOpen(false) }}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, fontSize: 13, background: 'transparent', color: win === w ? '#3ddc84' : 'var(--text)', fontWeight: win === w ? 700 : 400, cursor: 'pointer' }}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="op-chart-bars">
              {bars.map((pct, digit) => {
                const color = getBarColor(pct)
                const ratio = pct / (maxBar + 2)
                const showResult = lastResult?.digit === digit
                return (
                  <div key={digit} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%', position: 'relative' }}>
                    {showResult && lastResult && (
                      <span
                        key={lastResult.id}
                        style={{
                          position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                          display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
                          padding: '3px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                          letterSpacing: 0.4, color: '#0b0e14',
                          background: lastResult.won ? '#3ddc84' : '#ff5c5c',
                          boxShadow: lastResult.won ? '0 0 12px rgba(61,220,132,0.55)' : '0 0 12px rgba(255,92,92,0.55)',
                          animation: 'resultPop 0.35s ease-out',
                          zIndex: 5,
                        }}
                      >
                        {lastResult.won ? <IoCheckmark size={12} /> : <IoClose size={12} />}
                        {lastResult.won ? 'WIN' : 'LOSS'}
                      </span>
                    )}
                    <span className="tabular" style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1 }}>{pct.toFixed(1)}%</span>
                    <div style={{
                      width: '100%', height: `${Math.min(94, Math.max(4, ratio * 100))}%`, background: color,
                      borderRadius: 3,
                      outline: showResult ? `2px solid ${lastResult?.won ? '#3ddc84' : '#ff5c5c'}` : 'none',
                      outlineOffset: 1,
                    }} />
                    <span className="tabular" style={{ fontSize: 13, fontWeight: 700, color: showResult ? (lastResult?.won ? '#3ddc84' : '#ff5c5c') : 'var(--white)', lineHeight: 1 }}>{digit}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ---------------- Painel de operação manual (compacto) ---------------- */}
          <div className="card op-panel">
            {/* Selector de mercado: Over / Under / Matches / Differs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, background: 'var(--bg-card-hi)', borderRadius: 12, padding: 4 }}>
              {(['over', 'under', 'matches', 'differs'] as MarketType[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMarket(m)}
                  style={{
                    padding: '9px 0', minHeight: 38, background: market === m ? '#3ddc84' : 'transparent',
                    color: market === m ? '#0b0e14' : 'var(--text-dim)', border: 'none',
                    borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {MARKET_LABELS[m]}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: '8px 0 0' }}>
              {market === 'over' && 'O último dígito será maior que o seleccionado'}
              {market === 'under' && 'O último dígito será menor que o seleccionado'}
              {market === 'matches' && 'O último dígito será igual ao seleccionado'}
              {market === 'differs' && 'O último dígito será diferente do seleccionado'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 8 }}>
              {bars.map((pct, digit) => {
                const isSelected = digit === selectedDigit
                const isHigh = Math.abs(pct - info.maxPct) < 0.01
                const isLow = Math.abs(pct - info.minPct) < 0.01
                const valid = isDigitValidForMarket(market, digit)
                return (
                  <button
                    key={digit}
                    onClick={() => valid && setSelectedDigit(digit)}
                    disabled={!valid}
                    title={!valid ? 'Indisponível para este mercado' : undefined}
                    style={{
                      background: 'var(--bg-card-hi)', border: isSelected ? '1px solid #3ddc84' : '1px solid transparent',
                      borderRadius: 10, padding: '7px 0', display: 'flex', flexDirection: 'column', alignItems: 'center',
                      cursor: valid ? 'pointer' : 'not-allowed', opacity: valid ? 1 : 0.35,
                    }}
                  >
                    <span className="tabular" style={{ fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>{digit}</span>
                    <span className="tabular" style={{ fontSize: 10, marginTop: 1, color: isHigh ? '#3ddc84' : isLow ? '#ff5c5c' : 'var(--text-dim)' }}>
                      {pct.toFixed(1)}%
                    </span>
                  </button>
                )
              })}
            </div>

            {displayError && <p style={{ fontSize: 12, color: '#ff5c5c', margin: '8px 0 0' }}>{displayError}</p>}

            {/* Duração + Stake + Comprar — em linha; empilha em coluna nos <380px */}
            <div className="op-panel-row">
              <div className="op-field">
                <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Duração</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  style={fieldStyle}
                >
                  {DURATIONS.map(d => <option key={d} value={d}>{d} ticks</option>)}
                </select>
              </div>

              <div className="op-field">
                <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Stake (USD)</label>
                <input
                  type="number"
                  min={0.35}
                  step={0.5}
                  value={stake}
                  onChange={(e) => setStake(Number(e.target.value))}
                  style={fieldStyle}
                />
              </div>

              <button
                onClick={handleBuy}
                disabled={isBusy}
                className="op-buy-btn"
                style={{ cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1 }}
              >
                {isBusy ? 'Contrato em aberto…' : `Comprar ${MARKET_LABELS[market]}`}
              </button>
            </div>
          </div>
        </div>

        {/* ---------------- Histórico de operações (secção com scroll) ---------------- */}
        <div className="op-history">
          <TradesTable />
        </div>
      </div>

      <style>{`
        .op-page {
          height: 100dvh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: calc(14px + env(safe-area-inset-top, 0px)) 14px calc(14px + env(safe-area-inset-bottom, 0px));
          box-sizing: border-box;
          background: var(--bg, #0b0e14);
        }
        .op-topbar { flex: 0 0 auto; margin-bottom: 8px; }
        .op-back-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--border); color: var(--text);
          border-radius: 10px; padding: 0 14px; min-height: 38px; cursor: pointer; font-size: 13px;
        }

        /* Faixa de saldo: fina, sempre em linha (nunca quebra),
           rola na horizontal só se realmente faltar espaço. */
        .op-balance-card {
          flex: 0 0 auto;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: nowrap;
          padding: 8px 14px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .op-balance-card::-webkit-scrollbar { display: none; }
        .op-stat { flex: 0 0 auto; white-space: nowrap; }
        .op-stat-label { font-size: 10.5px; color: var(--text-dim); margin: 0; line-height: 1.2; }
        .op-stat-value { font-size: 16px; font-weight: 700; margin: 0; line-height: 1.25; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
        .op-stat-unit { font-size: 11px; color: var(--text-dim); }
        .op-acc-btn {
          margin-left: auto; flex: 0 0 auto; display: flex; align-items: center; gap: 6px;
          padding: 6px 10px; border-radius: 10px; cursor: pointer; white-space: nowrap; min-height: 36px;
        }
        .op-acc-label { font-size: 12px; font-weight: 700; white-space: nowrap; }
        .op-acc-icon {
          display: flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 7px;
          background: rgba(255,255,255,0.08); color: var(--text-dim);
        }

        .op-main {
          flex: 1 1 auto;
          min-height: 0;
          display: grid;
          gap: 10px;
          grid-template-columns: 1fr;
          grid-template-rows: minmax(150px, 0.85fr) auto minmax(160px, 1.15fr);
        }

        .op-left { display: contents; }

        .op-chart-card {
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .op-chart-head {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 8px 12px; border-bottom: 1px solid var(--border); flex: 0 0 auto;
        }
        .op-chart-bars {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          align-items: flex-end;
          gap: 6px;
          padding: 26px 12px 6px;
          position: relative;
          overflow: hidden;
        }

        .op-panel {
          min-height: 0;
          overflow: hidden;
          flex: 0 0 auto;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
        }
        .op-panel-row {
          display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; margin-top: 10px;
        }
        .op-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 100px; min-width: 90px; }
        .op-buy-btn {
          flex: 1 1 150px; min-width: 140px; background: #3ddc84; border: none; border-radius: 12px;
          min-height: 44px; padding: 10px 0; color: #0b0e14; font-weight: 700; font-size: 14px;
        }

        .op-history {
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* ── Mobile / ecrãs estreitos: 1 coluna. A página rola só se
           a soma não couber — nada é cortado. ── */
        @media (max-width: 859px) {
          .op-page { padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)); overflow-y: auto; -webkit-overflow-scrolling: touch; }
          .op-topbar { margin-bottom: 6px; }
          .op-back-btn { min-height: 34px; font-size: 12px; padding: 0 12px; }
          .op-balance-card { padding: 6px 12px; gap: 14px; margin-bottom: 6px; }
          .op-stat-label { font-size: 9.5px; }
          .op-stat-value { font-size: 13.5px; }
          .op-stat-unit { font-size: 10px; }
          .op-acc-btn { padding: 5px 8px; }
          .op-acc-label { font-size: 11px; }
          .op-acc-icon { width: 20px; height: 20px; }
          .op-main {
            flex: 0 0 auto;
            grid-template-rows: clamp(150px, 26dvh, 230px) auto 280px;
          }
        }

        /* Telemóveis muito estreitos — duração/stake/comprar empilham */
        @media (max-width: 380px) {
          .op-page { padding-left: 8px; padding-right: 8px; }
          .op-panel { padding: 10px 12px; }
          .op-panel-row { flex-direction: column; align-items: stretch; }
          .op-field, .op-buy-btn { min-width: 0; flex: 1 1 auto; }
          .op-chart-bars { padding: 26px 8px 6px; gap: 4px; }
        }

        /* Desktop: 2 colunas, 100dvh fixo; só o histórico rola */
        @media (min-width: 860px) {
          .op-main {
            grid-template-columns: minmax(0, 1fr) 380px;
            grid-template-rows: 1fr;
          }
          .op-left {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-height: 0;
            height: 100%;
          }
          .op-chart-card { flex: 1 1 auto; }
          .op-history { height: 100%; }
        }

        /* Monitores largos — o painel de operar ganha um teto de largura */
        @media (min-width: 1440px) {
          .op-panel { max-width: 720px; }
        }

        @keyframes resultPop {
          0%   { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.85); }
          60%  { opacity: 1; transform: translateX(-50%) translateY(-2px) scale(1.05); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>

      {/* ── Sheet: Selecionar Tipo de Conta (via Portal) —
          mesmo componente/estilo do ControlsSection.tsx ── */}
      {showAccSheet && (
        <Portal>
          <div className="glass-overlay" onClick={() => !switchingAcc && setShowAccSheet(false)}>
            <div className="glass-sheet" onClick={e => e.stopPropagation()}>
              <div className="glass-sheet-header">
                <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15 }}>Selecionar Tipo de Conta</p>
                {!switchingAcc && (
                  <button onClick={() => setShowAccSheet(false)} aria-label="Fechar" style={{ color: 'var(--text-faint)', padding: 6, display: 'inline-flex' }}>
                    <IoClose size={20} />
                  </button>
                )}
              </div>
              {switchingAcc ? (
                <div className="glass-sheet-loader">
                  <span style={{ width: 30, height: 30, border: '3px solid var(--border)', borderTopColor: 'var(--blue-hi)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>A ligar à conta…</span>
                </div>
              ) : (
                <div className="glass-sheet-body">
                  {accounts.map(a => (
                    <button key={a.account_id}
                      className={`glass-option ${currentAccount?.account_id === a.account_id ? 'active' : ''}`}
                      onClick={() => handleAccSelectSheet(a)}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: a.is_virtual ? demoColorDisplay : realColorDisplay }}>
                        {a.is_virtual ? `Conta ${demoLabelDisplay}` : `Conta ${realLabelDisplay}`}
                      </p>
                      <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 2 }}>Saldo: ${Number(a.balance ?? 0).toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}

// ── Página auto-contida: monta o seu próprio BotsProvider,
// igual ao DashboardPage.tsx. ──────────────────────────────────
export default function OperarManualPage() {
  return (
    <BotsProvider>
      <OperarManualInner />
    </BotsProvider>
  )
}
