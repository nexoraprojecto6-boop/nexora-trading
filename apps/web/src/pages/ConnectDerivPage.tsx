import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoArrowForward } from 'react-icons/io5'
import { useLoader } from '../context/LoaderContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { nav } from '../lib/navigation'
import { TERMS_ACCEPTED_KEY } from '../lib/config'

function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className="brand-mark">
      <path d="M14 1L27 14L14 27L1 14L14 1Z" stroke="url(#nxGradConnect)" strokeWidth="1.6" />
      <path d="M8 16.5L11.5 12L15 15.5L20 9" stroke="url(#nxGradConnect)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="nxGradConnect" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.55" stopColor="var(--blue-hi)" />
          <stop offset="1" stopColor="var(--red-hi)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function ConnectDerivPage() {
  const navigate = useNavigate()
  const { show } = useLoader()
  const { isAuthenticated, isLoading } = useAuth()
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (isAuthenticated) { navigate('/dashboard', { replace: true }); return }
    // Os termos têm de estar aceites antes de ligar a conta: o ecrã de entrada pede-os.
    let accepted = false
    try { accepted = localStorage.getItem(TERMS_ACCEPTED_KEY) === '1' } catch { /* sem armazenamento */ }
    if (!accepted) navigate('/', { replace: true })
  }, [isLoading, isAuthenticated, navigate])

  // O login faz-se por navegação para o servidor, que redireciona para a Deriv.
  const handleConnect = () => {
    setIsConnecting(true)
    show('A ligar à Deriv...')
    nav.go(api.loginUrl())
  }

  return (
    <div style={pageStyle}>
      <div style={bgStyle} />
      <div style={glowStyle} />

      <div className="fade-in" style={contentStyle}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 28 }}>
          <BrandMark size={44} />
        </div>

        <p style={{ color: 'var(--text)', fontSize: 18, fontWeight: 600, lineHeight: 1.45, marginBottom: 24 }}>
          Conecta a tua conta Deriv para começares a negociar
        </p>

        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="btn-primary"
          style={{ width: '100%', minHeight: 50, fontSize: 15 }}
        >
          {isConnecting ? 'A ligar...' : (<>Conectar à Deriv <IoArrowForward size={18} /></>)}
        </button>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  position: 'relative', minHeight: '100dvh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 'calc(24px + env(safe-area-inset-top, 0px)) 20px calc(24px + env(safe-area-inset-bottom, 0px))',
  overflow: 'hidden',
}

const bgStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
  background: 'linear-gradient(160deg, #05070c 0%, #0a0e17 45%, #05070c 100%)',
}

const glowStyle: React.CSSProperties = {
  position: 'fixed', top: '-18%', left: '50%', transform: 'translateX(-50%)',
  width: 600, height: 600, borderRadius: '50%', zIndex: 0, pointerEvents: 'none',
  background: 'radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%)',
}

const contentStyle: React.CSSProperties = {
  position: 'relative', zIndex: 10,
  width: '100%', maxWidth: 380, textAlign: 'center',
}
