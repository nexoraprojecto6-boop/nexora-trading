/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem absoluta da API (sem barra final), ex.: https://api.nexoraforex.pro */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Data/hora do build (definida em vite.config.ts). */
declare const __BUILD_TIME__: string;
