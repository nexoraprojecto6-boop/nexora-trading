// ============================================================
// NEXORA — Configuração de ambiente
//
// Em Vite, só variáveis que começam por VITE_ chegam ao browser, por isso
// NUNCA colocar segredos aqui. Não há endereços por omissão: um endereço
// errado "escondido" no código foi a origem de ligações para o sítio errado.
// ============================================================
import { normalizeApiBase, sanitizeAffiliateToken } from './url'

/** Origem da API (ex.: https://api.nexoraforex.pro) ou `undefined` se mal configurada. */
export const API_BASE_URL: string | undefined = normalizeApiBase(import.meta.env.VITE_API_BASE_URL)

/** Token de afiliado da Deriv (opcional). */
export const AFFILIATE_TOKEN: string | undefined = sanitizeAffiliateToken(import.meta.env.VITE_DERIV_AFFILIATE_TOKEN)
