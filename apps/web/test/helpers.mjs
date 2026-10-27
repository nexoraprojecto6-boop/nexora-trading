// Carrega o código real da aplicação (TS/TSX) através do próprio Vite, em modo servidor,
// como o build faria (import.meta.env, JSX, __BUILD_TIME__). Sem browser, sem mocks de módulos.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));

export async function createLoader(env = {}) {
  // Variáveis VITE_* de teste (nunca credenciais reais).
  Object.assign(process.env, { VITE_API_BASE_URL: "https://api.teste.pro" }, env);
  const server = await createServer({
    root,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true },
  });
  return { load: (path) => server.ssrLoadModule(path), close: () => server.close() };
}

// Definições tal como o servidor as envia em GET /bots (espelham o catálogo do bot-engine).
export const OBSERVADOR = {
  id: "observador",
  name: "Observador (demonstração)",
  summary: "Acompanha os candles de um símbolo. Não abre operações.",
  description: "Bot de demonstração. NÃO abre operações nem usa dinheiro. Não é uma estratégia de trading.",
  params: [
    { kind: "symbol", key: "symbol", label: "Símbolo", help: "Código do mercado (ex.: R_100).", default: "R_100" },
    { kind: "select", key: "candleSeconds", label: "Duração do candle", options: [{ value: "60", label: "1 minuto" }, { value: "120", label: "2 minutos" }, { value: "300", label: "5 minutos" }], default: "60" },
  ],
};
export const RISK_PARAMS = [
  { kind: "decimal", key: "stake", label: "Valor por operação", help: "Montante de cada operação.", min: "0.01", max: "100000" },
  { kind: "decimal", key: "maxDailyLoss", label: "Perda máxima por dia", min: "0.01", max: "1000000" },
  { kind: "integer", key: "maxTradesPerDay", label: "Operações por dia (máx.)", min: 1, max: 1000 },
  { kind: "integer", key: "maxOpenPositions", label: "Operações abertas ao mesmo tempo (máx.)", min: 1, max: 10 },
  { kind: "integer", key: "maxConsecutiveLosses", label: "Perdas seguidas até parar", min: 1, max: 50 },
  { kind: "integer", key: "cooldownSeconds", label: "Espera entre operações (segundos)", min: 0, max: 86400 },
];
