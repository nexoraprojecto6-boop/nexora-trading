// ============================================================
// NEXORA — Configuração central da interface
//
// Contactos, ligações e textos que antes estavam espalhados pelas páginas.
// ============================================================
import { AFFILIATE_TOKEN } from './env'
import { buildDerivSignupUrl } from './url'

/**
 * Funcionalidades que dependem de partes do servidor que ainda não existem.
 * O código das páginas fica no projeto; basta ligar a flag quando o servidor as suportar.
 */
export const FEATURES = {
  /** Painel de administração (utilizadores, comissões, avisos). */
  admin: false,
  /** Compra manual de contratos. */
  manualTrading: false,
  /** Avisos difundidos pelos administradores. */
  notifications: false,
} as const

// Um só número, com indicativo do país (antes havia dois diferentes: com e sem 244).
export const SUPPORT_WHATSAPP_NUMBER = '244976289984'
export const SUPPORT_WHATSAPP_URL = (msg: string) =>
  `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`

export const MENTORIA_VIP_LINK = 'https://chat.whatsapp.com/GaFZpRc5w7C4uX8rusX4bO'
export const DERIV_TERMS_URL = 'https://deriv.com/tnc/general-terms.pdf'
export const TERMS_ACCEPTED_KEY = 'nexora_terms_accepted_v1'

/** Link de registo na corretora, com atribuição de afiliado quando configurada. */
export const derivSignupUrl = (): string => buildDerivSignupUrl(AFFILIATE_TOKEN)

export const DEFAULT_ACCOUNT_LABELS = { realLabel: 'REAL', demoLabel: 'DEMO' }

export const TERMOS_NEXORA = `TERMOS E CONDIÇÕES — NEXORA FOREX

1. ACEITAÇÃO DOS TERMOS
Ao utilizar a plataforma Nexora Forex, o utilizador aceita integralmente os presentes termos e condições.

2. RISCOS
O trading envolve riscos elevados de perda de capital. Os resultados passados não garantem resultados futuros. O utilizador é o único responsável pelas suas decisões de investimento.

3. RESPONSABILIDADE
A Nexora Forex não se responsabiliza por perdas financeiras resultantes do uso da plataforma.

4. CONTACTO
Para questões, contacte-nos via WhatsApp: +${SUPPORT_WHATSAPP_NUMBER}`
