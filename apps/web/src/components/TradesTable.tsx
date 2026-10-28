import { useState } from 'react'
import { IoTrashOutline, IoTrendingUp, IoDocumentTextOutline, IoNotificationsOutline } from 'react-icons/io5'
import { useBots } from '../context/BotsContext'
import { useTrading } from '../context/TradingContext'
import type { TradeRecord } from '../context/BotsContext'
import { currencyDecimals } from '../lib/money'

type MainTab = 'trader' | 'notificacoes'

// Colunas em fr — somam sempre a 100% do espaço disponível, nunca
// transbordam horizontalmente.
const COLS = '0.85fr 1.3fr 1.15fr 0.85fr 1.05fr'

// Cor da linha — bloco arredondado, igual à imagem
const ROW_BG = '#1b1b1f'

// Célula: nunca quebra linha (nowrap + ellipsis) para que uma
// hora/tick/preço mais comprido nunca estique a linha nem desalinhe a grelha.
const cellBase: React.CSSProperties = {
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
}

const iconBtn: React.CSSProperties = {
  color: 'var(--text-dim)', width: 36, height: 36, borderRadius: 10,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

// Estado vazio — ocupa a altura disponível, com tamanhos fluidos
function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 200, color: 'var(--text-faint)', gap: 10, padding: '24px 20px', textAlign: 'center',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 'clamp(48px, 12vw, 60px)', height: 'clamp(48px, 12vw, 60px)', borderRadius: '50%',
        background: 'var(--bg-card-hi)', color: 'var(--text-dim)', flexShrink: 0,
      }}>
        {icon}
      </span>
      <p style={{ fontSize: 'clamp(14px, 3.6vw, 16px)', fontWeight: 600, color: 'var(--text-dim)' }}>{title}</p>
      <p style={{ fontSize: 'clamp(12px, 3vw, 13.5px)', color: 'var(--text-faint)', maxWidth: 280, lineHeight: 1.4 }}>{subtitle}</p>
    </div>
  )
}

// Preço de saída: usa o texto original da Deriv (exitSpot) com as casas reais do
// símbolo — assim o último algarismo mostrado é o dígito real (antes: sempre 2
// casas, o que escondia/arredondava o dígito em R_10, R_50, etc.).
function formatTick(t: TradeRecord): string {
  if (t.exitSpot) return t.exitSpot
  return typeof t.exitTick === 'number' ? t.exitTick.toFixed(2) : '—'
}

export function TradesTable() {
  const { trades, clearTrades, ticks: liveTicks } = useBots()
  const ticks = liveTicks ?? []
  const evenPct = ticks.length ? Math.round((ticks.filter(t => t.digit % 2 === 0).length / ticks.length) * 100) : 0
  const { currency } = useTrading()
  const [mainTab, setMainTab] = useState<MainTab>('trader')
  // casas decimais da moeda da conta (2 em USD/EUR, 8 em BTC...)
  const dec = currencyDecimals(currency)

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', height: '100%', minHeight: 0, overflow: 'hidden', borderRadius: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px 8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 18, minWidth: 0 }}>
          {(['trader', 'notificacoes'] as MainTab[]).map(tab => (
            <button key={tab} onClick={() => setMainTab(tab)} style={{
              fontWeight: 600, fontSize: 'clamp(13px, 3.6vw, 15px)', minHeight: 36, whiteSpace: 'nowrap',
              color: mainTab === tab ? 'var(--white)' : 'var(--text-faint)',
              borderBottom: mainTab === tab ? '2px solid var(--blue-hi)' : '2px solid transparent',
            }}>
              {tab === 'trader' ? 'Trader' : 'Notificações'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button onClick={() => { if (confirm('Limpar o histórico de trades, ganhos e perdas?')) clearTrades() }} disabled={trades.length === 0} title="Limpar histórico" aria-label="Limpar histórico" style={{ ...iconBtn, opacity: trades.length === 0 ? 0.35 : 1, cursor: trades.length === 0 ? 'default' : 'pointer' }}>
            <IoTrashOutline size={19} />
          </button>
          <button title="Gráfico" aria-label="Gráfico" style={iconBtn}>
            <IoTrendingUp size={19} />
          </button>
        </div>
      </div>

      {/* Painel de conteúdo — só esta área rola */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
        {mainTab === 'notificacoes' && (
          ticks.length === 0 ? (
            <EmptyState
              icon={<IoNotificationsOutline size={26} />}
              title="Sem notificações"
              subtitle="Escolha um bot: os últimos ticks do mercado aparecem aqui"
            />
          ) : (
            <div style={{ padding: '12px 14px' }}>
              <p style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
                Últimos ticks
              </p>
              <div className="tabular" style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--text-dim)', marginBottom: 12, flexWrap: 'wrap' }}>
                <span>Último: <b style={{ color: '#fff' }}>{ticks[0]?.quote}</b></span>
                <span>Pares: <b style={{ color: 'var(--blue-hi)' }}>{evenPct}%</b></span>
                <span>Ímpares: <b style={{ color: 'var(--amber)' }}>{100 - evenPct}%</b></span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ticks.map((t, i) => (
                  <span key={`${t.quote}-${i}`} title={t.quote} className="tabular" style={{
                    width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, color: '#fff',
                    background: t.digit % 2 === 0 ? 'rgba(59,130,246,0.28)' : 'rgba(245,158,11,0.28)',
                    border: i === 0 ? '1px solid #fff' : '1px solid transparent',
                  }}>{t.digit}</span>
                ))}
              </div>
              <p style={{ color: 'var(--text-faint)', fontSize: 11, marginTop: 10 }}>O mais recente à esquerda. Azul = par, laranja = ímpar.</p>
            </div>
          )
        )}

        {mainTab === 'trader' && (
          trades.length === 0 ? (
            <EmptyState
              icon={<IoDocumentTextOutline size={26} />}
              title="Nenhum trade ainda"
              subtitle="Selecciona um bot e toca em play para começar"
            />
          ) : (
            <div style={{ padding: '4px 10px 10px' }}>
              {/* Cabeçalho — sticky */}
              <div style={{
                position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)',
                display: 'grid', gridTemplateColumns: COLS, gap: 6,
                padding: '8px 8px',
                fontSize: 'clamp(10.5px, 2.8vw, 12.5px)', fontWeight: 700, color: 'var(--text-dim)',
              }}>
                <span style={cellBase}>Hora</span>
                <span style={cellBase}>Tipo</span>
                <span style={{ ...cellBase, textAlign: 'right' }}>Tick Final</span>
                <span style={{ ...cellBase, textAlign: 'right' }}>Preço</span>
                <span style={{ ...cellBase, textAlign: 'right' }}>Resultado</span>
              </div>

              {/* Linhas — blocos arredondados */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {trades.map((t: TradeRecord, i: number) => (
                  <div key={`${t.id}-${i}`} style={{
                    display: 'grid', gridTemplateColumns: COLS, gap: 6, alignItems: 'center',
                    background: ROW_BG, borderRadius: 10, padding: '10px 8px',
                    fontSize: 'clamp(10.5px, 2.8vw, 12.5px)',
                  }}>
                    <span className="tabular" style={{ ...cellBase, color: '#fff' }}>{t.hora}</span>
                    <span style={{ ...cellBase, color: '#fff', fontWeight: 600 }}>{t.contractType ?? '—'}</span>
                    <span className="tabular" style={{ ...cellBase, color: '#fff', textAlign: 'right' }} title={formatTick(t)}>
                      {formatTick(t)}
                    </span>
                    <span className="tabular" style={{ ...cellBase, color: '#fff', textAlign: 'right' }}>{t.stake.toFixed(dec)}</span>
                    <span className="tabular" style={{ ...cellBase, textAlign: 'right', fontWeight: 700, color: t.profit >= 0 ? '#22c55e' : 'var(--red-hi)' }}>
                      {Math.abs(t.profit).toFixed(dec)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
