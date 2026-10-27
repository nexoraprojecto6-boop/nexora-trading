// ============================================================
// NEXORA — Tipos da compra manual
//
// O cliente WebSocket do servidor antigo (bots a correr no servidor, eventos
// em tempo real) foi retirado: o servidor novo ainda não executa operações.
// Ficam aqui só os tipos que a página "Operar Manual" e o BotsContext usam,
// para o código dessa página continuar intacto até existir servidor.
// ============================================================

export interface ManualBuyParams {
  symbol: string
  contractType: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF' | 'CALL' | 'PUT'
  duration: number
  durationUnit: 'ticks' | 's' | 'm'
  stake: number
  barrier?: number | string
  /** Preenchido pelo BotsContext; o servidor devolve-o em todas as respostas. */
  clientRef?: string
}

export interface ManualBuyResult {
  clientRef?: string
  success: boolean
  contractId?: string
  payout?: number
  error?: string
}

export interface ManualTradeClosed {
  clientRef?: string
  contractId: string
  profit: number
  won: boolean
  stake: number
  exitTick?: number
  exitDigit?: number
}

/** O servidor não conseguiu acompanhar o contrato até ao fim (pode continuar aberto na Deriv). */
export interface ManualTradeError {
  clientRef?: string
  contractId?: string
  message: string
}
