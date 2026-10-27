// ============================================================
// NEXORA — API
//
// Reexporta os tipos/erros e cria o cliente com a origem configurada (VITE_API_BASE_URL).
// A lógica está em apiClient.ts (injetável e testável) e apiTypes.ts.
// ============================================================
import { API_BASE_URL } from './env'
import { createApi } from './apiClient'

export * from './apiTypes'
export const api = createApi(API_BASE_URL)
