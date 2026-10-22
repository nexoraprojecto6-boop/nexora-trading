/**
 * Endpoints oficiais da Deriv API (documentação em developers.deriv.com,
 * verificada em 22/10/2026). Todos são valores públicos, não sensíveis.
 */

/** Base URL das chamadas REST. */
export const DERIV_REST_BASE_URL = "https://api.derivws.com";

/** WebSocket público: dados de mercado, sem autenticação nem OTP. */
export const DERIV_WS_PUBLIC_URL = "wss://api.derivws.com/trading/v1/options/ws/public";

/** Limites documentados que o cliente respeita por omissão. */
export const DERIV_LIMITS = {
  /** Máximo de pings por segundo, por ligação. */
  maxPingsPerSecond: 10,
  /** Orçamento partilhado de "outras chamadas" por minuto no WebSocket. */
  otherCallsPerMinute: 220,
} as const;
