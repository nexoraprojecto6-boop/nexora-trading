export type ContractType =
  | "DIGITMATCH" | "DIGITOVER" | "DIGITUNDER" | "DIGITEVEN" | "DIGITODD";

export interface Tick { digit: number; epoch: number; quote: number }

export interface BuyParams {
  contract_type: ContractType;
  underlying_symbol: string;
  amount: number;
  barrier?: string;
  currency: string;
}

export interface BuyReceipt {
  contract_id: number;
  buy_price: number;
  payout: number;
  balance_after: number;
}

export interface Settled { contract_id: number; profit: number; won: boolean }

export interface MartingaleConfig {
  enabled: boolean;
  /** Máximo de passos seguidos de recuperação antes de voltar à stake base. */
  maxSteps: number;
  /** Teto absoluto da stake (protege a conta). */
  maxStake: number;
  /** Lucro extra desejado ao recuperar, em múltiplos da stake base (0 = só recuperar). */
  profitTargetMult: number;
}

export interface RunOptions {
  stake: number;
  martingale?: Partial<MartingaleConfig>;
  stopLoss?: number;   // perda acumulada da sessão que pára o bot
  takeProfit?: number; // lucro acumulado da sessão que pára o bot
}

export type BotEvent =
  | { type: "started"; botId: string }
  | { type: "entry"; botId: string; stake: number; digit: number; step: number; latencyMs: number }
  | { type: "result"; botId: string; profit: number; won: boolean; sessionProfit: number }
  | { type: "stopped"; botId: string; reason: string }
  | { type: "error"; botId: string; message: string };
