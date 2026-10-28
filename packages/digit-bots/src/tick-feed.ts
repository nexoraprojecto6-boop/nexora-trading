import { EventEmitter } from 'node:events';
import { DigitStats, lastDigit } from './digits.js';
import type { SocketFactory, SocketLike } from './session.js';

export const PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';

export interface TickEvent {
  symbol: string;
  quote: number;
  epoch: number;
  digit: number;
}

/**
 * Fluxo público de ticks (sem autenticação) + estatística dos últimos dígitos.
 * É informativo (painel). Os bots NÃO esperam por ele para entrar.
 */
export class TickFeed extends EventEmitter {
  readonly stats: DigitStats;
  private socket: SocketLike | null = null;
  private closed = false;
  private attempts = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly makeSocket: SocketFactory;

  constructor(
    private readonly symbol: string,
    opts: { windowSize?: number; socketFactory?: SocketFactory; url?: string } = {},
  ) {
    super();
    this.stats = new DigitStats(opts.windowSize ?? 100);
    this.url = opts.url ?? PUBLIC_WS_URL;
    this.makeSocket =
      opts.socketFactory ?? ((u) => new (globalThis as any).WebSocket(u) as SocketLike);
  }

  private readonly url: string;

  start(): void {
    this.closed = false;
    const s = this.makeSocket(this.url);
    this.socket = s;
    s.onopen = () => {
      this.attempts = 0;
      s.send(JSON.stringify({ ticks: this.symbol, subscribe: 1, req_id: 1 }));
    };
    s.onmessage = (ev) => {
      let m: any;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.msg_type !== 'tick' || !m.tick) return;
      const { quote, epoch, pip_size: pip } = m.tick;
      const digit = lastDigit(Number(quote), Number(pip ?? m.tick.pip_size ?? 2));
      this.stats.push(digit);
      this.emit('tick', { symbol: this.symbol, quote, epoch, digit } as TickEvent);
    };
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      if (this.closed) return;
      const delay = Math.min(30_000, 1000 * 2 ** this.attempts++);
      this.timer = setTimeout(() => this.start(), delay);
      this.timer.unref?.();
    };
    s.onerror = () => {};
  }

  stop(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    const s = this.socket;
    this.socket = null;
    try {
      s?.close();
    } catch {
      /* ignore */
    }
  }
}
