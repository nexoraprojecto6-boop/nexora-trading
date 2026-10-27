import { useNavigate } from 'react-router-dom'
import { IoChevronBack } from 'react-icons/io5'

// Ecrã mostrado nas rotas cujas funcionalidades ainda não têm servidor (ver FEATURES em lib/config).
export default function FeatureUnavailablePage({ title }: { title: string }) {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div className="fade-in" style={{ textAlign: 'center', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <h1 className="logo-text" style={{ fontSize: 20 }}>NEXORA FOREX</h1>
        <p style={{ color: 'var(--white)', fontSize: 18, fontWeight: 700 }}>{title}</p>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.6 }}>
          Esta funcionalidade ainda não está disponível. Volta ao painel para continuares.
        </p>
        <button onClick={() => navigate('/dashboard', { replace: true })} className="btn-ghost" style={{ padding: '12px 24px', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <IoChevronBack size={16} /> Voltar ao painel
        </button>
      </div>
    </div>
  )
}
