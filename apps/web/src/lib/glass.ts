// ============================================================
// NEXORA FOREX — Estilos "glass" reutilizáveis
// ============================================================
import type { CSSProperties } from 'react'
export { SUPPORT_WHATSAPP_NUMBER, SUPPORT_WHATSAPP_URL } from './config'
// Card em vidro fosco padrão (azul-marinho + azul-roxo, tom da app — paleta Bertoni)
export const glassCard: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 400,
  padding: 32,
  borderRadius: 20,
  border: '1px solid var(--border)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  background: 'rgba(5,31,61,0.7)',
  backdropFilter: 'blur(20px) saturate(140%)',
  WebkitBackdropFilter: 'blur(20px) saturate(140%)',
}
// Card "vidro puro tipo sangue" — vermelho, sem neon, para o ecrã de
// conexão com a Deriv. Saturado mas fosco, sem glow.
export const glassCardBlood: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 400,
  padding: 32,
  borderRadius: 20,
  border: '1px solid rgba(180, 20, 40, 0.35)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
  background: 'rgba(60, 8, 16, 0.55)',
  backdropFilter: 'blur(22px) saturate(160%)',
  WebkitBackdropFilter: 'blur(22px) saturate(160%)',
}
// Reflexo estilo "água" por baixo de um cartão — efeito espelho a
// desvanecer, sem brilho/neon. Aplicar num wrapper com position:relative
// que envolve o cartão, usando este objeto no ::after via classe utilitária
// (ver .glass-reflect no CSS global) — aqui devolvemos o estilo inline
// equivalente para quando não se pode adicionar classes globais.
export const reflectWrapperClass = 'glass-reflect'
// CSS global a adicionar UMA VEZ em styles/index.css (ver instruções)
export const GLASS_REFLECT_CSS = `
.glass-reflect { position: relative; }
.glass-reflect::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 4%;
  right: 4%;
  height: 55%;
  background: inherit;
  border-radius: inherit;
  transform: scaleY(-1);
  opacity: 0.16;
  filter: blur(3px);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55), transparent 75%);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55), transparent 75%);
  pointer-events: none;
}
`
// Botão vermelho puro, fosco, sem neon — usado para "Conectar à Deriv"
export const bloodButton: CSSProperties = {
  width: '100%',
  padding: '14px 20px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'linear-gradient(180deg, rgba(154,15,32,0.9), rgba(110,8,22,0.95))',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  color: '#fdeceb',
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: 0.3,
  cursor: 'pointer',
  transition: 'filter 0.15s ease, transform 0.15s ease',
}
export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.03)',
  color: 'var(--text-dim, #cfd6e6)',
  fontSize: 14,
  outline: 'none',
}
export const labelStyle: CSSProperties = {
  display: 'block',
  color: 'var(--text-faint)',
  fontSize: 12,
  marginBottom: 6,
  fontWeight: 600,
  letterSpacing: 0.3,
}
export const errorTextStyle: CSSProperties = {
  color: '#ff6b7a',
  fontSize: 12.5,
  marginTop: 4,
}
