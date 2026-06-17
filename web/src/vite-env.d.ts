/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API-Basis-URL. Leer/„/api" = Single-Origin (Standard). Für getrennte Domains: z.B. "https://api.geheimtrips.de/api" */
  readonly VITE_API_BASE?: string;
  /** WebSocket-URL fürs Geheimquiz (nur bei getrennten Domains nötig). */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
