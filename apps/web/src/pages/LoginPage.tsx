import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoOpenOutline } from 'react-icons/io5'
import { AO, BR, PT, US, ES } from 'country-flag-icons/react/3x2'
import { useLoader } from '../context/LoaderContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { nav } from '../lib/navigation'
import { API_BASE_URL } from '../lib/env'
import { DERIV_TERMS_URL, TERMOS_NEXORA, TERMS_ACCEPTED_KEY } from '../lib/config'
import { cspViolations, diagnose } from '../lib/diagnostics'
import { errorTextStyle } from '../lib/glass'

// ---------------------------------------------------------------------------
// Bandeiras (apenas visual — não altera nenhuma lógica de autenticação/i18n
// já existente. Se um dia quiseres ligar a um sistema de idiomas real, basta
// usar o `activeLang` abaixo).
// ---------------------------------------------------------------------------
const FLAGS = [
  { code: 'ao', Flag: AO, label: 'Angola' },
  { code: 'br', Flag: BR, label: 'Brasil' },
  { code: 'pt', Flag: PT, label: 'Portugal' },
  { code: 'us', Flag: US, label: 'English' },
  { code: 'es', Flag: ES, label: 'Español' },
]

// ---------------------------------------------------------------------------
// Termos e Condições — mostrados no modal depois do login.
// O texto da Nexora fica embutido; o da Deriv só é linkado.
// ---------------------------------------------------------------------------
function termsAlreadyAccepted(): boolean {
  try { return localStorage.getItem(TERMS_ACCEPTED_KEY) === '1' } catch { return false }
}

// ---------------------------------------------------------------------------
// Marca — logótipo 100% em SVG/código, sem ficheiro de imagem
// ---------------------------------------------------------------------------
function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className="brand-mark">
      <path d="M14 1L27 14L14 27L1 14L14 1Z" stroke="url(#nxGradLogin)" strokeWidth="1.6" />
      <path d="M8 16.5L11.5 12L15 15.5L20 9" stroke="url(#nxGradLogin)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="nxGradLogin" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.55" stopColor="var(--blue-hi)" />
          <stop offset="1" stopColor="var(--red-hi)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { show, hide } = useLoader()
  const { isAuthenticated, isLoading, sessionError } = useAuth()

  const [activeLang, setActiveLang] = useState('ao')
  const [showTerms, setShowTerms] = useState(false)
  // O que o utilizador pediu antes de aceitar os termos: entrar ou criar conta.
  const [pending, setPending] = useState<{ prompt?: 'registration' } | null>(null)
  const [details, setDetails] = useState<string[] | null>(null)

  // Ao voltar de outra página (ex.: botão "voltar" a meio do login), não deixa o loader preso.
  useEffect(() => { hide() }, [hide])

  // Já há sessão: segue para o painel.
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isLoading, isAuthenticated, navigate])

  // O login faz-se na Deriv: navega-se para o servidor, que redireciona para a Deriv
  // (OAuth com PKCE). O frontend nunca vê a palavra-passe nem os tokens.
  const connect = (prompt?: 'registration') => {
    show(prompt === 'registration' ? 'A abrir o registo na Deriv...' : 'A ligar à Deriv...')
    nav.go(api.loginUrl(prompt))
  }

  const requestConnect = (prompt?: 'registration') => {
    if (termsAlreadyAccepted()) { connect(prompt); return }
    setPending(prompt ? { prompt } : {})
    setShowTerms(true)
  }

  const handleAcceptTerms = () => {
    try { localStorage.setItem(TERMS_ACCEPTED_KEY, '1') } catch { /* ignora */ }
    setShowTerms(false)
    const next = pending
    setPending(null)
    connect(next?.prompt)
  }

  const handleDeclineTerms = () => {
    // Sem aceitar os termos não há acesso: fica no ecrã de entrada.
    setShowTerms(false)
    setPending(null)
  }

  const showDetails = async () => {
    if (API_BASE_URL === undefined) return
    setDetails(['A testar…'])
    setDetails(await diagnose({
      base: API_BASE_URL,
      pageOrigin: window.location.origin,
      buildTime: __BUILD_TIME__,
      fetchFn: (...args) => fetch(...args),
      violations: cspViolations,
    }))
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--blue-hi)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={pageWrapStyle}>
      {/* Fundo com reflexo tipo gráfico de trading */}
      <GlassChartBackground />

      {/* Bandeiras — topo, centradas na horizontal */}
      <div style={flagsRowStyle}>
        {FLAGS.map((f) => (
          <button
            key={f.code}
            type="button"
            title={f.label}
            aria-label={f.label}
            onClick={() => setActiveLang(f.code)}
            style={flagBtnStyle(activeLang === f.code)}
          >
            <f.Flag style={{ width: 20, height: 14, borderRadius: 2, display: 'block' }} />
          </button>
        ))}
      </div>

      {/* Contentor de entrada (sem quadrado/borda) */}
      <div className="fade-in" style={cardStyle}>
        <div style={{ textAlign: 'center' }}>
          <div className="brand" style={{ justifyContent: 'center', marginBottom: 10 }}>
            <BrandMark size={40} />
          </div>
          <h1 className="brand-text brand-text--lg">NEXORA FOREX</h1>
        </div>

        <div style={{ marginTop: 26 }}>
          {sessionError && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <p role="alert" style={{ ...errorTextStyle, marginBottom: 8 }}>{sessionError}</p>
              {API_BASE_URL !== undefined && (
                <button type="button" onClick={() => void showDetails()} style={linkBtnStyle}>Ver detalhes técnicos</button>
              )}
              {details && (
                <pre style={{ marginTop: 8, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, color: 'var(--text-faint)' }}>{details.join('\n')}</pre>
              )}
            </div>
          )}

          <button type="button" onClick={() => requestConnect()} className="btn-primary" style={{ width: '100%' }}>
            Entrar com a Deriv
          </button>
          <button type="button" onClick={() => requestConnect('registration')} className="btn-ghost" style={{ width: '100%', marginTop: 12 }}>
            Criar conta na Deriv
          </button>
        </div>

        <p style={{ color: 'var(--text-faint)', fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
          O login é feito na própria Deriv: nunca vemos a tua palavra-passe.
        </p>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-faint)', fontSize: 11 }}>© 2026 Nexora Forex</p>
        </div>
      </div>

      {/* Modal — Termos e Condições da Nexora e da Deriv */}
      {showTerms && <TermsModal onAccept={handleAcceptTerms} onDecline={handleDeclineTerms} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de Termos e Condições
// ---------------------------------------------------------------------------
function TermsModal({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const [tab, setTab] = useState<'nexora' | 'deriv'>('nexora')

  return (
    <div className="glass-overlay" style={{ zIndex: 900 }}>
      <div className="glass-sheet" style={{ maxWidth: 460 }}>
        <div className="glass-sheet-header">
          <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 16 }}>Termos e Condições</p>
        </div>

        {/* Tabs — Nexora / Deriv */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={() => setTab('nexora')}
            style={{
              flex: 1, padding: '14px 0', fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
              color: tab === 'nexora' ? 'var(--white)' : 'var(--text-faint)',
              borderBottom: tab === 'nexora' ? '2px solid var(--blue-hi)' : '2px solid transparent',
            }}
          >
            NEXORA FOREX
          </button>
          <button
            onClick={() => setTab('deriv')}
            style={{
              flex: 1, padding: '14px 0', fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
              color: tab === 'deriv' ? 'var(--white)' : 'var(--text-faint)',
              borderBottom: tab === 'deriv' ? '2px solid var(--blue-hi)' : '2px solid transparent',
            }}
          >
            DERIV
          </button>
        </div>

        <div className="glass-sheet-body" style={{ padding: 18 }}>
          {tab === 'nexora' ? (
            <pre style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)' }}>
              {TERMOS_NEXORA}
            </pre>
          ) : (
            <div>
              <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
                Ao ligar a tua conta Deriv através da Nexora Forex, estás também
                sujeito aos termos e condições gerais da Deriv, que regulam a
                abertura de conta, depósitos, levantamentos e a negociação de
                contratos na própria Deriv. A Nexora Forex não altera nem
                substitui esses termos.
              </p>
              <a
                href={DERIV_TERMS_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  color: 'var(--blue-hi)', fontSize: 13, fontWeight: 600,
                }}
              >
                Ver termos completos da Deriv
                <IoOpenOutline size={14} />
              </a>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, padding: 16, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onDecline} className="btn-ghost" style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>
            Não aceito
          </button>
          <button onClick={onAccept} className="btn-primary" style={{ flex: 1 }}>
            Li e aceito os termos
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fundo animado — gráfico de mercado (velas + linha) em movimento contínuo
// (puramente decorativo). O padrão repete-se a cada 1200 unidades, por isso
// o loop é perfeito, sem saltos.
// ---------------------------------------------------------------------------
const MKT_W = 1200
const MKT_STEP = 30
const MKT_N = MKT_W / MKT_STEP

const mktPrice = (x: number) =>
  420 - (
    70 * Math.sin((2 * Math.PI * x / MKT_W) * 2) +
    45 * Math.sin((2 * Math.PI * x / MKT_W) * 5 + 1) +
    25 * Math.sin((2 * Math.PI * x / MKT_W) * 11 + 2)
  )

const mktRnd = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

const MKT_CANDLES = Array.from({ length: MKT_N }, (_, i) => {
  const x = i * MKT_STEP + MKT_STEP / 2
  const open = mktPrice(x - MKT_STEP / 2) + (mktRnd(i) - 0.5) * 20
  const close = mktPrice(x + MKT_STEP / 2) + (mktRnd(i + 100) - 0.5) * 20
  const high = Math.min(open, close) - mktRnd(i + 200) * 22 - 4
  const low = Math.max(open, close) + mktRnd(i + 300) * 22 + 4
  return { x, open, close, high, low, up: close <= open }
})

const MKT_LINE =
  'M' +
  Array.from({ length: MKT_N + 1 }, (_, k) => `${k * MKT_STEP},${mktPrice(k * MKT_STEP).toFixed(1)}`).join(' L')

function MarketSeries({ offset }: { offset: number }) {
  return (
    <g transform={`translate(${offset} 0)`}>
      <path d={MKT_LINE} fill="none" stroke="rgba(79,139,255,0.55)" strokeWidth="2" />
      {MKT_CANDLES.map((c, i) => {
        const color = c.up ? '#0ecb81' : '#f6465d'
        const top = Math.min(c.open, c.close)
        const h = Math.max(Math.abs(c.open - c.close), 2)
        return (
          <g key={i}>
            <line x1={c.x} x2={c.x} y1={c.high} y2={c.low} stroke={color} strokeWidth="1.5" />
            <rect x={c.x - 6} y={top} width="12" height={h} fill={color} />
          </g>
        )
      })}
    </g>
  )
}

function GlassChartBackground() {
  return (
    <>
      <style>{`
        @keyframes nexora-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-${MKT_W}px); }
        }
        @keyframes nexora-sheen {
          0%   { opacity: 0.35; }
          50%  { opacity: 0.6; }
          100% { opacity: 0.35; }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(160deg, #05070c 0%, #0a0e17 45%, #05070c 100%)',
        zIndex: 0,
      }} />

      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%',
          opacity: 0.28, zIndex: 0, pointerEvents: 'none',
        }}
      >
        {/* Grelha horizontal fixa */}
        {[160, 280, 400, 520, 640].map((y) => (
          <line key={y} x1="0" x2="1200" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}

        {/* Gráfico em movimento (duas cópias seguidas para o loop ser contínuo) */}
        <g style={{ animation: 'nexora-scroll 45s linear infinite' }}>
          <MarketSeries offset={0} />
          <MarketSeries offset={MKT_W} />
        </g>
      </svg>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: 'radial-gradient(circle at 50% 20%, rgba(255,255,255,0.05), transparent 60%)',
        animation: 'nexora-sheen 8s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

// O wrapper rola em vez de cortar: com teclado aberto ou ecrã baixo
// o contentor nunca fica escondido em cima/baixo.
const pageWrapStyle: React.CSSProperties = {
  position: 'relative', minHeight: '100dvh',
  display: 'flex', justifyContent: 'center',
  padding: 'calc(64px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px))',
  overflowY: 'auto', overflowX: 'hidden',
}

const flagsRowStyle: React.CSSProperties = {
  position: 'fixed', top: 'calc(16px + env(safe-area-inset-top, 0px))', left: '50%', transform: 'translateX(-50%)',
  display: 'flex', gap: 10, zIndex: 20,
}

const flagBtnStyle = (active: boolean): React.CSSProperties => ({
  width: 38, height: 38, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)',
  border: 'none',
  cursor: 'pointer', transition: 'all 0.2s ease',
  boxShadow: active ? '0 0 0 3px rgba(118,131,255,0.35)' : 'none',
})

const cardStyle: React.CSSProperties = {
  position: 'relative', zIndex: 10,
  width: '100%', maxWidth: 400,
  margin: 'auto 0',
  padding: 'clamp(24px, 6vw, 44px) clamp(18px, 5vw, 32px) clamp(22px, 5vw, 32px)',
}

const linkBtnStyle: React.CSSProperties = {
  color: 'var(--text-faint)', fontSize: 13,
  background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0',
}
