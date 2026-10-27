import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useBots } from '../context/BotsContext'

type BannerKind = 'error' | 'insufficient' | 'success' | 'stoploss' | 'info'
interface BannerMsg {
  kind: BannerKind
  title: string
  text: string
}

// ── Ícones inline (sem emoji) ───────────────────────────────
function IconAlertTriangle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconCreditCard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}
function IconCheckCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
function IconOctagonX() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

const ICONS: Record<BannerKind, () => ReactElement> = {
  error: IconAlertTriangle,
  insufficient: IconCreditCard,
  success: IconCheckCircle,
  stoploss: IconOctagonX,
  info: IconCheckCircle,
}

export function NotificationBar() {
  const { lastError, statusMessage } = useBots()
  // ── Prioridade: erro geral > saldo insuficiente > meta > stop loss ──
  // lastError    → erro genérico do bot (bot:error)          → mensagem fixa de reload
  // statusMessage.kind === 'error'   → bot:insufficient_balance → saldo insuficiente
  // statusMessage.kind === 'success' → bot:goal_reached (lucro)  → meta atingida
  // statusMessage.kind === 'warning' → bot:goal_reached (perda)  → stop loss atingido
  const active: BannerMsg | null = useMemo(() => {
    if (lastError) {
      return { kind: 'error', title: 'Erro', text: 'Tente carregar a página.' }
    }
    // Mensagem com título próprio (ex.: avisos do painel): usa o texto recebido em vez dos fixos abaixo.
    if (statusMessage?.title) {
      const kindMap = { error: 'error', warning: 'insufficient', success: 'success', info: 'info' } as const
      return { kind: kindMap[statusMessage.kind], title: statusMessage.title, text: statusMessage.text }
    }
    if (statusMessage?.kind === 'error') {
      return { kind: 'insufficient', title: 'Saldo insuficiente', text: 'Faça um depósito na Deriv.' }
    }
    if (statusMessage?.kind === 'success') {
      return { kind: 'success', title: 'Meta atingida', text: 'Parabéns! Bateu a sua meta.' }
    }
    if (statusMessage?.kind === 'warning') {
      return { kind: 'stoploss', title: 'Stop loss', text: 'Limite de perda atingido.' }
    }
    return null
  }, [lastError, statusMessage])
  const [visible, setVisible] = useState(false)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeKey = active ? `${active.kind}:${active.text}` : null
  useEffect(() => {
    if (!activeKey) { setVisible(false); return }
    if (activeKey === dismissedKey) return
    setVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    // sucesso e stop loss desaparecem sozinhos; erro e saldo insuficiente
    // ficam visíveis até o contexto limpar a mensagem (BotsContext já tem timeout próprio)
    if (active?.kind === 'success' || active?.kind === 'stoploss' || active?.kind === 'info') {
      hideTimer.current = setTimeout(() => setVisible(false), 5000)
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])
  if (!active || !visible) return null
  const palette: Record<BannerKind, { border: string; glow: string; color: string; iconBg: string }> = {
    error:        { border: 'rgba(233,32,63,0.45)',  glow: 'rgba(233,32,63,0.25)',  color: 'var(--red-hi)',  iconBg: 'rgba(233,32,63,0.14)' },
    insufficient: { border: 'rgba(245,166,35,0.45)', glow: 'rgba(245,166,35,0.2)',  color: '#f5a623',        iconBg: 'rgba(245,166,35,0.14)' },
    success:      { border: 'rgba(24,201,122,0.45)', glow: 'rgba(24,201,122,0.25)', color: 'var(--green)',   iconBg: 'rgba(24,201,122,0.14)' },
    stoploss:     { border: 'rgba(233,32,63,0.45)',  glow: 'rgba(233,32,63,0.25)',  color: 'var(--red-hi)',  iconBg: 'rgba(233,32,63,0.14)' },
    info:         { border: 'rgba(90,169,255,0.45)', glow: 'rgba(90,169,255,0.2)',  color: '#5aa9ff',        iconBg: 'rgba(90,169,255,0.14)' },
  }
  const p = palette[active.kind]
  const Icon = ICONS[active.kind]
  return (
    <div className="glass-banner" style={{ borderColor: p.border, boxShadow: `0 8px 32px ${p.glow}, inset 0 1px 0 rgba(255,255,255,0.12)` }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: p.iconBg, color: p.color,
      }}>
        <Icon />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', color: p.color, fontWeight: 700, fontSize: 14, lineHeight: 1.3, marginBottom: 2 }}>
          {active.title}
        </span>
        <span style={{ display: 'block', color: 'var(--text-dim)', fontWeight: 500, fontSize: 12.5, lineHeight: 1.4 }}>
          {active.text}
        </span>
      </span>
      <button
        onClick={() => { setDismissedKey(activeKey); setVisible(false) }}
        className="glass-banner-close"
        aria-label="Fechar"
        style={{ flexShrink: 0 }}
      >✕</button>
    </div>
  )
}
