import { useMemo } from 'react'
import { useTrading } from '../context/TradingContext'
import { useBots } from '../context/BotsContext'
import { currencyDecimals } from '../lib/money'

// Cores da imagem de referência — painel Saldo quase preto,
// painel Lucro/Prejuízo cinza mais claro, faixa Operações preta pura.
const BG_SALDO = '#141416'
const BG_LUCRO = '#26262b'
const BG_OPERACOES = '#0a0a0c'
const COLOR_LABEL = '#a3a3ab'
const COLOR_GREEN = '#22c55e'

// Tamanhos fluidos: mantêm a medida original em ecrãs normais e
// encolhem só nos muito estreitos (320px), sem nunca transbordar.
const PAD = 'clamp(10px, 3.4vw, 18px)'
const LABEL_SIZE = 'clamp(12px, 3.6vw, 15px)'
const VALUE_SIZE = 'clamp(16px, 4.8vw, 25px)'

const valueStyle: React.CSSProperties = {
  color: '#ffffff', fontSize: VALUE_SIZE, fontWeight: 700,
  letterSpacing: '-0.02em', lineHeight: 1.2, overflowWrap: 'anywhere',
}

export function BalanceCard() {
  const { balance, currency, loading } = useTrading()
  const { sessionBots } = useBots()
  const { netPnL, totalWins, totalLosses } = useMemo(() => {
    const active = sessionBots.filter(b => b.stats.totalTrades > 0 || b.status === 'running')
    return {
      netPnL: active.reduce((s, b) => s + b.stats.netPnL, 0),
      totalWins: active.reduce((s, b) => s + b.stats.wins, 0),
      totalLosses: active.reduce((s, b) => s + b.stats.losses, 0),
    }
  }, [sessionBots])
  const isProfit = netPnL >= 0

  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(13,20,36,0.85)', borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 28, height: 28 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(63,116,255,0.15)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'var(--blue-hi)', animation: 'spin 0.8s linear infinite' }} />
            </div>
            <span style={{ color: 'var(--text-faint)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 }}>A carregar…</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex' }}>
        {/* ── Saldo ── */}
        <div style={{ flex: 1, padding: `clamp(12px, 3.4vw, 16px) ${PAD}`, background: BG_SALDO, minWidth: 0 }}>
          <p style={{ color: COLOR_LABEL, fontSize: LABEL_SIZE, fontWeight: 600, marginBottom: 6, whiteSpace: 'nowrap' }}>Saldo</p>
          <p className="tabular" style={valueStyle}>
            {currency === 'USD' ? '$ ' : ''}{balance.toFixed(currencyDecimals(currency))}{' '}
            <span style={{ fontSize: '0.55em', fontWeight: 600, color: '#c2c2c8' }}>{currency}</span>
          </p>
        </div>

        {/* ── Lucro/Prejuízo ── */}
        <div style={{ flex: 1, padding: `clamp(12px, 3.4vw, 16px) ${PAD}`, background: BG_LUCRO, minWidth: 0 }}>
          <p style={{ color: COLOR_LABEL, fontSize: LABEL_SIZE, fontWeight: 600, marginBottom: 6, whiteSpace: 'nowrap' }}>Lucro/Prejuízo</p>
          <p className="tabular" style={valueStyle}>
            <span style={{ color: '#ffffff' }}>{currency === 'USD' ? '$' : currency}</span>{' '}
            <span style={{ color: isProfit ? COLOR_GREEN : 'var(--red-hi)' }}>
              {netPnL < 0 ? '-' : ''}{Math.abs(netPnL).toFixed(currencyDecimals(currency))}
            </span>
          </p>
        </div>
      </div>

      {/* ── Operações — faixa de largura total, alinhada à direita ── */}
      <div style={{
        background: BG_OPERACOES, padding: `10px ${PAD}`,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
      }}>
        <span style={{ color: COLOR_LABEL, fontSize: 'clamp(12px, 3.4vw, 14px)', fontWeight: 600 }}>Operações</span>
        <span className="tabular" style={{ color: COLOR_GREEN, fontWeight: 700, fontSize: 15 }}>
          {totalWins}
        </span>
        <span style={{ color: COLOR_LABEL, fontSize: 14 }}>/</span>
        <span className="tabular" style={{ color: '#e8e8ec', fontWeight: 700, fontSize: 15 }}>
          {totalLosses}
        </span>
      </div>
    </div>
  )
}
