import { useEffect } from 'react'

interface DepositModalProps {
  open: boolean
  onClose: () => void
}

const LINKS = {
  deposit: 'https://home.deriv.com/dashboard/deposit?from=home&depositSheet=1&currency=USD',
  transfer: 'https://home.deriv.com/dashboard/transfer?from=portfolio',
  withdraw: 'https://home.deriv.com/dashboard/withdraw/verify?currency=USD&from=portfolio&openWithdraw=1',
}

export function DepositModal({ open, onClose }: DepositModalProps) {
  // Fecha com ESC
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Navega na mesma aba (substitui a página atual)
  const handleOpen = (url: string) => {
    window.location.href = url
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(7,11,20,0.65)', backdropFilter: 'blur(6px)',
        padding: 16, animation: 'depositFadeIn 0.18s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          background: 'rgba(18,24,38,0.82)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          position: 'relative',
          animation: 'depositScaleIn 0.2s ease',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', color: 'var(--text-faint)',
            border: 'none', cursor: 'pointer', fontSize: 13,
          }}
        >
          ✕
        </button>

        <h2 style={{
          fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          marginBottom: 4, color: 'var(--text)',
        }}>
          Movimentar Fundos
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>
          Escolha uma opção — você será direcionado à Deriv
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => handleOpen(LINKS.deposit)}
            style={{
              padding: '13px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, var(--green), #0d9b52)',
              color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: 0.4,
              cursor: 'pointer',
            }}
          >
            Depositar com AirTM
          </button>

          <button
            onClick={() => handleOpen(LINKS.transfer)}
            style={{
              padding: '13px 16px', borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'rgba(24,87,255,0.12)',
              color: 'var(--blue-hi)', fontWeight: 700, fontSize: 13, letterSpacing: 0.4,
              cursor: 'pointer',
            }}
          >
            Transferir para Options
          </button>

          <button
            onClick={() => handleOpen(LINKS.withdraw)}
            style={{
              padding: '13px 16px', borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'rgba(233,32,63,0.10)',
              color: 'var(--red-hi)', fontWeight: 700, fontSize: 13, letterSpacing: 0.4,
              cursor: 'pointer',
            }}
          >
            Levantar Dinheiro na Deriv
          </button>
        </div>
      </div>

      <style>{`
        @keyframes depositFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes depositScaleIn { from { opacity: 0; transform: scale(0.94) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  )
}
