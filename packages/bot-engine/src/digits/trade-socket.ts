import type { BuyParams, BuyReceipt, Settled } from "./types.js";

type Pending = { resolve: (r: BuyReceipt) => void; reject: (e: Error) => void };

/**
 * Ligação autenticada (OTP) mantida aberta. `getOtpUrl` deve chamar
 * POST /trading/v1/options/accounts/{id}/otp — o OTP é de uso único,
 * por isso pede-se um novo em cada (re)ligação.
 */
export class TradeSocket {
  private ws?: WebSocket;
  private ready: Promise<void> = Promise.resolve();
  private reqId = 1;
  private pending = new Map<number, Pending>();
  private settledCbs = new Set<(s: Settled) => void>();
  private seen = new Set<number>();
  private ping?: ReturnType<typeof setInterval>;
  private closed = false;
  private retry = 0;

  constructor(private getOtpUrl: () => Promise<string>) {}

  async start(): Promise<void> { this.closed = false; this.ready = this.open(); return this.ready; }
  stop(): void { this.closed = true; clearInterval(this.ping); this.ws?.close(); }
  onSettled(fn: (s: Settled) => void): () => void { this.settledCbs.add(fn); return () => this.settledCbs.delete(fn); }

  private open(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const ws = new WebSocket(await this.getOtpUrl());
        this.ws = ws;
        ws.onopen = () => {
          this.retry = 0;
          clearInterval(this.ping);
          this.ping = setInterval(() => ws.readyState === 1 && ws.send('{"ping":1}'), 25_000);
          resolve();
        };
        ws.onmessage = (ev) => this.handle(JSON.parse(String(ev.data)));
        ws.onclose = () => {
          for (const p of this.pending.values()) p.reject(new Error("ligação fechada"));
          this.pending.clear();
          if (this.closed) return;
          this.ready = new Promise((r) => setTimeout(r, Math.min(5000, 200 * 2 ** this.retry++)))
            .then(() => this.open()).catch(() => {});
        };
        ws.onerror = () => ws.close();
      } catch (e) { reject(e); }
    });
  }

  private handle(m: any): void {
    if (m.msg_type === "buy" || m.error) {
      const p = this.pending.get(m.req_id);
      if (p) {
        this.pending.delete(m.req_id);
        if (m.error) p.reject(new Error(m.error.message ?? m.error.code));
        else p.resolve(m.buy as BuyReceipt);
      }
    }
    if (m.msg_type === "proposal_open_contract") {
      const c = m.proposal_open_contract;
      if (c?.is_sold && !this.seen.has(c.contract_id)) {
        this.seen.add(c.contract_id);
        if (this.seen.size > 500) this.seen.clear();
        const profit = Number(c.profit);
        for (const fn of this.settledCbs) fn({ contract_id: c.contract_id, profit, won: profit > 0 });
      }
    }
  }

  /** Compra directa com `parameters` (sem passo de proposal): menos um round-trip. */
  async buy(p: BuyParams): Promise<BuyReceipt> {
    if (this.ws?.readyState !== 1) await this.ready;
    const id = this.reqId++;
    const parameters: Record<string, unknown> = {
      contract_type: p.contract_type,
      underlying_symbol: p.underlying_symbol,
      amount: p.amount,
      basis: "stake",
      currency: p.currency,
      duration: 1,
      duration_unit: "t",
    };
    if (p.barrier !== undefined) parameters.barrier = p.barrier;
    return new Promise<BuyReceipt>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ buy: "1", price: p.amount, parameters, subscribe: 1, req_id: id }));
    });
  }
}
