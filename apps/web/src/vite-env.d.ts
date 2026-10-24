/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem absoluta da API (sem barra final), ex.: https://api.nexoraforex.pro */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
