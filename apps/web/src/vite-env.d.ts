/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem absoluta da API (sem barra final), ex.: https://api.nexoraforex.pro */
  readonly VITE_API_BASE_URL?: string
  /** Token de afiliado da Deriv (opcional): atribui os registos feitos pelo link do menu. */
  readonly VITE_DERIV_AFFILIATE_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Data/hora do build (definida em vite.config.ts). */
declare const __BUILD_TIME__: string
