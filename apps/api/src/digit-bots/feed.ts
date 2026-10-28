import { EventEmitter } from 'node:events';
import type { SocketFactory, SocketLike } from './session.js';
import type { DigitOption } from './types.js';

export const PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';
/** Mínimo de dígitos para a análise valer; abaixo disto o bot entra no lado por omissão. */
export const MIN_SAMPLE = 20;
const HISTORY_COUNT = 100;

/** Último dígito do preço, respeitando o pip_size (ex.: 1234.50 com pip 2 -> 0). */
export function lastDigit(quote: number, pipSize: number): number {
  const s = quote.toFixed(Math.max(0, pipSize));
  return Number(s[s.length - 1]);
}

/** Condição de vitória de uma opção (dígito final do contrato de 1 tick). */
export function optionPredicate(o: DigitOption): (digit: number) => boolean {
  const b = o.barrier ?? 0;
  switch (o.contractType) {
    case 'DIGITOVER':
      return (d) => d > b;
    case 'DIGITUNDER':
      return (d) => d < b;
    case 'DIGITMATCH':
      return (d) => d === b;
    case 'DIGITDIFF':
      return (d) => d !== b;
    case 'DIGITEVEN':
      return (d) => d % 2 === 0;
    default:
      return (d) => d % 2 === 1;
  }
}

/** Probabilidade normal (0-1) de a opção ganhar, com dígitos uniformes. */
export function expectedShare(o: DigitOption): number {
  const b = o.barrier ?? 0;
  switch (o.contractType) {
    case 'DIGITOVER':
      return (9 - b) / 10;
    case 'DIGITUNDER':
      return b / 10;
    case 'DIGITMATCH':
      return 0.1;
    case 'DIGITDIFF':
      return 0.9;
    default:
      return 0.5;
  }
}

/** Janela rolante dos últimos dígitos. */
export class DigitStats {
  private window: number[] = [];

  constructor(private readonly size = HISTORY_COUNT) {}

  push(digit: number): void {
    this.window.push(digit);
    if (this.window.length > this.size) this.window.shift();
  }

  /** Coloca o histórico ANTES dos ticks que já chegaram. */
  seed(digits: number[]): void {
    this.window = [...digits, ...this.window].slice(-this.size);
  }

  get count(): number {
    return this.window.length;
  }

  /** Fração (0-1) de dígitos que cumprem a condição, nos últimos `last` (ou em toda a janela). */
  share(pred: (digit: number) => boolean, last?: number): number {
    const w = last === undefined ? this.window : this.window.slice(-last);
    if (w.length === 0) return 0;
    return w.filter(pred).length / w.length;
  }
}

/**
 * Fluxo público de ticks (sem autenticação) com histórico inicial: ao ligar, pede os últimos
 * ticks, para a análise estar pronta antes do Play. Religa sozinho se a ligação cair.
 */
export class TickFeed extends EventEmitter {
  readonly stats = new DigitStats(HISTORY_COUNT);
  private socket: SocketLike | null = null;
  private closed = false;
  private attempts = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly makeSocket: SocketFactory;

  constructor(
    private readonly symbol: string,
    opts: { socketFactory?: SocketFactory } = {},
  ) {
    super();
    this.makeSocket = opts.socketFactory ?? ((u) => new (globalThis as any).WebSocket(u) as SocketLike);
  }

  start(): void {
    this.closed = false;
    let s: SocketLike;
    try {
      s = this.makeSocket(PUBLIC_WS_URL);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = s;
    s.onopen = () => {
      this.attempts = 0;
      s.send(JSON.stringify({ ticks: this.symbol, subscribe: 1, req_id: 1 }));
      s.send(JSON.stringify({ ticks_history: this.symbol, count: HISTORY_COUNT, end: 'latest', style: 'ticks', req_id: 2 }));
    };
    s.onmessage = (ev) => {
      let m: any;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.msg_type === 'tick' && m.tick) {
        this.stats.push(lastDigit(Number(m.tick.quote), Number(m.tick.pip_size ?? 2)));
        this.emit('update');
      } else if (m.msg_type === 'history' && Array.isArray(m.history?.prices)) {
        const pip = Number(m.pip_size ?? 2);
        this.stats.seed((m.history.prices as unknown[]).map((p) => lastDigit(Number(p), pip)));
        this.emit('update');
      }
    };
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      if (!this.closed) this.scheduleRetry();
    };
    s.onerror = () => {};
  }

  private scheduleRetry(): void {
    const delay = Math.min(30_000, 1000 * 2 ** this.attempts++);
    this.timer = setTimeout(() => this.start(), delay);
    this.timer.unref?.();
  }

  get ready(): boolean {
    return this.stats.count >= MIN_SAMPLE;
  }

  /** Resolve quando há dígitos suficientes para analisar, ou ao fim do tempo (nunca bloqueia o Play). */
  whenReady(timeoutMs: number): Promise<void> {
    if (this.stats.count >= MIN_SAMPLE) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.off('update', check);
        resolve();
      };
      const check = () => {
        if (this.stats.count >= MIN_SAMPLE) done();
      };
      const timer = setTimeout(done, timeoutMs);
      this.on('update', check);
    });
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
