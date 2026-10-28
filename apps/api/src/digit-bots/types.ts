export type DigitContractType =
  | 'DIGITOVER'
  | 'DIGITUNDER'
  | 'DIGITMATCH'
  | 'DIGITDIFF'
  | 'DIGITEVEN'
  | 'DIGITODD';

export interface DigitOption {
  contractType: DigitContractType;
  /** Dígito de previsão (0-9). Obrigatório em OVER/UNDER/MATCH/DIFF; ignorado em EVEN/ODD. */
  barrier?: number;
}

export interface BotConfig {
  id: string;
  label: string;
  /** Opções em que o bot pode entrar. Com `adaptive`, escolhe a mais forte antes de cada ordem. */
  options: DigitOption[];
  adaptive: boolean;
  symbol: string;
  /** Stake base por operação. */
  stake: number;
  /** Para o bot quando o prejuízo da sessão chega a este valor (0 = desligado). */
  stopLoss: number;
  /** Para o bot quando o lucro da sessão chega a este valor (0 = desligado). */
  takeProfit: number;
  /** Para após N perdas seguidas (0 = desligado). */
  maxConsecutiveLosses: number;
  /** Para após N operações (0 = sem limite). */
  maxTrades: number;
  /** Multiplicador do stake após perda. 1 = desligado. Ignorado se `smartMartingale` estiver ligado. */
  stakeMultiplierOnLoss: number;
  /** Teto do stake quando há martingale (0 = sem teto; NÃO recomendado). */
  maxStake: number;
  /** Pausa entre operações em ms. 0 = entra logo que a anterior termina. */
  cooldownMs: number;

  // ── Novos (todos opcionais: configurações antigas continuam a funcionar) ──
  /** 'scalper' = compra a cada tick que cumpre a condição, sem esperar o contrato anterior. */
  mode?: 'sequential' | 'scalper';
  /** Scalper: só entra se o último dígito for MENOR que isto (ex.: 3). */
  scalperBelow?: number;
  /** Scalper: máximo de contratos abertos ao mesmo tempo (omissão 3). */
  maxOpen?: number;
  /** Martingale inteligente: recupera a perda acumulada com o retorno real do contrato. Nunca no scalper. */
  smartMartingale?: boolean;
  /** Smart: passos máximos seguidos antes de voltar à stake base (omissão 4). */
  martingaleMaxSteps?: number;
  /** Smart: lucro alvo ao recuperar, em múltiplos da stake base (omissão 1). */
  martingaleProfitMult?: number;
}

export type BotStatus = 'idle' | 'running' | 'stopped';

export type StopReason =
  | 'manual'
  | 'stop_loss'
  | 'take_profit'
  | 'max_consecutive_losses'
  | 'max_trades'
  | 'insufficient_balance'
  | 'error';

export interface TradeRecord {
  botId: string;
  contractId: number;
  contractType: DigitContractType;
  barrier?: number;
  stake: number;
  payout: number;
  profit: number;
  won: boolean;
  /** Tempo entre enviar a ordem de compra e receber a confirmação. */
  latencyMs: number;
  /** Tempo total até o contrato liquidar. */
  settledMs: number;
  balanceAfter: number | null;
  /** Tick de saída (texto exato), quando a Deriv o devolve. */
  exitSpot?: string;
  /** Percentagem recente (últimos 100 ticks) da opção escolhida, quando havia análise. */
  pickPct?: number;
  at: number;
}

export interface BotStats {
  botId: string;
  label: string;
  status: BotStatus;
  stopReason?: StopReason;
  lastError?: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profit: number;
  consecutiveLosses: number;
  currentStake: number;
  /** Passo atual do martingale inteligente (0 = stake base). */
  martingaleStep?: number;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  /** Contrato de 1 tick aberto neste momento (alimenta a barra de progresso). */
  open?: { contractId: number; stake: number; at: number };
}

/** Subconjunto de `proposal_open_contract` usado pelos bots. */
export interface OpenContract {
  contract_id: number;
  status?: string | null;
  is_sold?: number;
  profit?: string | number;
  buy_price?: string | number;
  sell_price?: string | number | null;
  payout?: string | number;
  [key: string]: unknown;
}

/** O que os bots precisam da ligação à Deriv (facilita testes). */
export interface TradingSession {
  readonly currency: string;
  ready(): Promise<void>;
  request<T = any>(msg: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  watchContract(contractId: number, cb: (poc: OpenContract) => void): () => void;
}

export interface Limiter {
  acquire(): Promise<void>;
}
