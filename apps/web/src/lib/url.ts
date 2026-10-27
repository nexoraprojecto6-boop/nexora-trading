// ============================================================
// NEXORA — Funções de URL (puras, sem dependência do Vite: fáceis de testar)
// ============================================================

/** Aceita só URLs https (ou http em localhost) sem credenciais, parâmetros ou fragmento. */
export function normalizeApiBase(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return undefined
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return undefined
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return undefined
  return url.toString().replace(/\/+$/, '')
}

/** Token de afiliado: só letras, números, _ e - (8 a 64). Qualquer outra coisa é ignorada. */
export function sanitizeAffiliateToken(raw: string | undefined): string | undefined {
  const t = raw?.trim()
  return t && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : undefined
}

/** Link de registo na corretora, com atribuição de afiliado quando há token. */
export function buildDerivSignupUrl(token?: string): string {
  const base = 'https://hub.deriv.com/tradershub/signup'
  if (!token) return base
  const q = new URLSearchParams({ t: token, utm_campaign: 'NEXORA', utm_medium: 'affiliate', utm_source: token })
  return `${base}?${q.toString()}`
}
