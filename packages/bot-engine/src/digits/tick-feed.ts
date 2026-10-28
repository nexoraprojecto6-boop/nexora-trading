import { DigitWindow, lastDigit } from "./digit-window.js";
import type { Tick } from "./types.js";

const PUBLIC_WS = "wss://api.derivws.com/trading/v1/options/ws/public";

/** Ligação pública sempre quente: o clique do utilizador nunca espera por ligação/subscrição. */
export class TickFeed {
  readonly window = new DigitWindow(50);
  private ws?: WebSocket;
  private listeners = new Set<(t: Tick) => void>();
  private closed = false;
  private retry = 0;

  constructor(private symbol: string) {}

  start(): void { this.closed = false; this.open(); }
  stop(): void { this.closed = true; this.ws?.close(); }
  on(fn: (t: Tick) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  private open(): void {
    const ws = new WebSocket(PUBLIC_WS);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ ticks: this.symbol, subscribe: 1 }));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.msg_type !== "tick" || !m.tick || m.tick.quote == null) return;
      const t: Tick = {
        digit: lastDigit(m.tick.quote, m.tick.pip_size ?? 2),
        epoch: m.tick.epoch,
        quote: m.tick.quote,
      };
      this.window.push(t);
      for (const fn of this.listeners) fn(t);
    };
    ws.onclose = () => {
      if (this.closed) return;
      setTimeout(() => this.open(), Math.min(5000, 200 * 2 ** this.retry++));
    };
    ws.onerror = () => ws.close();
  }
}
