import type { Limiter, OpenContract, TradingSession } from '../src/types.js';

export const noLimit: Limiter = { acquire: async () => {} };

/** Sessão falsa: cada compra liquida com o próximo resultado do guião (won/lost). */
export class FakeSession implements TradingSession {
  currency = 'USD';
  sent: any[] = [];
  private n = 0;
  private outcomes: ('won' | 'lost')[];
  private payoutRatio: number;
  balance = 1000;
  failBuyWith: Error | null = null;

  constructor(outcomes: ('won' | 'lost')[], payoutRatio = 1.1) {
    this.outcomes = outcomes;
    this.payoutRatio = payoutRatio;
  }

  async ready(): Promise<void> {}

  async request(msg: Record<string, unknown>): Promise<any> {
    this.sent.push(msg);
    if (msg.buy === 1) {
      if (this.failBuyWith) throw this.failBuyWith;
      const price = msg.price as number;
      this.balance -= price;
      return {
        msg_type: 'buy',
        buy: {
          contract_id: ++this.n,
          buy_price: price,
          payout: +(price * this.payoutRatio).toFixed(2),
          balance_after: this.balance,
        },
      };
    }
    return {};
  }

  watchContract(contractId: number, cb: (p: OpenContract) => void): () => void {
    const buy = this.sent.filter((m) => m.buy === 1)[contractId - 1];
    const price = buy.price as number;
    const outcome = this.outcomes[(contractId - 1) % this.outcomes.length]!;
    const payout = +(price * this.payoutRatio).toFixed(2);
    const profit = outcome === 'won' ? +(payout - price).toFixed(2) : -price;
    if (outcome === 'won') this.balance += payout;
    queueMicrotask(() =>
      cb({
        contract_id: contractId,
        status: outcome,
        is_sold: 1,
        profit: String(profit),
        buy_price: String(price),
        payout: String(payout),
      }),
    );
    return () => {};
  }
}
