import { useState, type ReactNode } from 'react'
import { GLASS_REFLECT_CSS } from '../lib/glass'

export interface AppNotification {
  id: string
  title: string
  message: string
  time: string
  read?: boolean
  icon?: ReactNode
}

interface Props {
  notifications: AppNotification[]
  onMarkAllRead?: () => void
  onNotificationClick?: (n: AppNotification) => void
  // ── NOVO: modo controlado ────────────────────────────────
  // Se `open` for passado, o componente deixa de gerir o próprio
  // estado de abertura — quem usa o componente controla via
  // `onOpenChange`. Sem isso, comportamento 100% igual ao anterior
  // (self-contained, com o próprio sino fixo no canto).
  open?: boolean
  onOpenChange?: (open: boolean) => void
  // Esconde o botão-sino embutido — usado quando o gatilho de
  // abertura já está noutro lugar (ex: badge sobre o botão MENU).
  hideBellTrigger?: boolean
}

// ── Ícones inline (sem emoji) ───────────────────────────────
function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
function IconMegaphone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l18-5v12L3 13v-2z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.2-3" />
    </svg>
  )
}

// Painel central flutuante em vidro "tipo água": transparente, com blur
// forte (deixa o dashboard por trás visível e distorcido, como se fosse
// vidro molhado) e um reflexo subtil por baixo do painel.
export default function NotificationCenterFloating({
  notifications, onMarkAllRead, onNotificationClick,
  open, onOpenChange, hideBellTrigger,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = (v: boolean) => {
    onOpenChange?.(v)
    if (!isControlled) setInternalOpen(v)
  }
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <>
      <style>{GLASS_REFLECT_CSS}</style>

      {/* Botão de abertura próprio — fixo, canto superior.
          Escondido quando `hideBellTrigger` for true (o gatilho
          vive noutro lugar, ex: badge sobre o botão MENU). */}
      {!hideBellTrigger && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Abrir notificações"
          style={{
            position: 'fixed', top: 18, right: 18, zIndex: 40,
            width: 44, height: 44, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(14,16,19,0.6)', border: '1px solid var(--border)',
            backdropFilter: 'blur(14px) saturate(150%)', WebkitBackdropFilter: 'blur(14px) saturate(150%)',
            cursor: 'pointer', color: 'var(--text-dim)',
          }}
        >
          <IconBell />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
              background: 'var(--red-hi)', color: '#fff', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
            }}>
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
            background: 'rgba(4,4,5,0.45)',
            backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-reflect fade-in"
            style={{
              position: 'relative', width: '100%', maxWidth: 420, maxHeight: '70vh',
              display: 'flex', flexDirection: 'column',
              borderRadius: 0,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(14,16,19,0.72)',
              backdropFilter: 'blur(28px) saturate(180%)',
              WebkitBackdropFilter: 'blur(28px) saturate(180%)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>Notificações</h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}
                  >
                    Marcar todas como lidas
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} style={{ fontSize: 18, color: 'var(--text-faint)', lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <p style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                  Sem notificações por agora.
                </p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onNotificationClick?.(n)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '14px 20px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      background: n.read ? 'transparent' : 'rgba(118,131,255,0.08)',
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                    }}
                  >
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 30, height: 30, borderRadius: 8, marginTop: 1, flexShrink: 0,
                      background: 'var(--bg-card-hi)', color: 'var(--text-dim)',
                    }}>
                      {n.icon ?? <IconMegaphone />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--white)', marginBottom: 2 }}>
                        {n.title}
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 4, lineHeight: 1.4 }}>
                        {n.message}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{n.time}</span>
                    </span>
                    {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue-hi)', marginTop: 6, flexShrink: 0 }} />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
