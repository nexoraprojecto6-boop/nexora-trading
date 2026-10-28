import { AppError, err, ok, type Result } from "@nexora/shared";
import { BotManager, DerivSession, PRESETS, TickFeed, type BotConfig, type BotStats, type TradeRecord } from "../digit-bots/index.js";

export interface RunnerAccount {
  readonly accountId: string;
  readonly accountType: "demo" | "real";
}

export interface Totals {
  trades: number;
  wins: number;
  losses: number;
  profit: number;
  gain: number;
  loss: number;
}

export interface LiveState {
  readonly accountId: string | null;
  readonly bots: BotStats[];
  readonly trades: TradeRecord[];
  /** Resultados desde o último "limpar histórico", por bot. */
  readonly totals: Record<string, Totals>;
}

export interface BotRunner {
  /** Ids dos bots que realmente operam. */
  isRunnable(botId: string): boolean;
  /** Abre a ligação à Deriv antes do Play, para a primeira ordem sair sem esperar. */
  warmUp(input: { userId: string; token: string; account: RunnerAccount; symbol: string }): Promise<Result<void>>;
  start(input: { userId: string; token: string; account: RunnerAccount; botId: string; overrides: Partial<BotConfig> }): Promise<Result<void>>;
  stop(userId: string, botId: string): Promise<void>;
  state(userId: string): LiveState;
  /** Apaga o histórico e os totais (ganhos/perdas). Não altera os limites de risco de bots a correr. */
  clearHistory(userId: string): void;
  close(): Promise<void>;
}

export interface BotRunnerOptions {
  /** Contas reais só operam com isto ativo (DERIV_ALLOW_REAL=yes). */
  readonly allowReal: boolean;
  readonly log?: (message: string) => void;
}

interface Entry {
  readonly session: DerivSession;
  readonly manager: BotManager;
  readonly accountId: string;
  readonly token: string;
  readonly trades: TradeRecord[];
  totals: Record<string, Totals>;
  lastUsed: number;
}

const IDLE_MS = 15 * 60_000;

export function createBotRunner(options: BotRunnerOptions): BotRunner {
  const entries = new Map<string, Entry>();
  const log = options.log ?? (() => undefined);

  const isBusy = (entry: Entry): boolean => entry.manager.status().some((s) => s.status === "running");

  function dispose(userId: string): void {
    const entry = entries.get(userId);
    if (entry === undefined) return;
    entries.delete(userId);
    void entry.manager.stopAll().catch(() => undefined);
    entry.session.close();
  }

  // Ticks públicos por símbolo, partilhados por todos os utilizadores (alimentam a análise dos bots).
  const feeds = new Map<string, { feed: TickFeed; lastUsed: number }>();
  function feedFor(symbol: string): TickFeed {
    let held = feeds.get(symbol);
    if (held === undefined) {
      const feed = new TickFeed(symbol);
      feed.start();
      held = { feed, lastUsed: Date.now() };
      feeds.set(symbol, held);
    }
    held.lastUsed = Date.now();
    return held.feed;
  }

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [symbol, held] of feeds) {
      if (now - held.lastUsed > IDLE_MS) {
        held.feed.stop();
        feeds.delete(symbol);
      }
    }
    for (const [userId, entry] of entries) {
      if (!isBusy(entry) && now - entry.lastUsed > IDLE_MS) dispose(userId);
    }
  }, 60_000);
  sweeper.unref();

  function ensure(userId: string, token: string, account: RunnerAccount): Result<Entry> {
    if (account.accountType === "real" && !options.allowReal) {
      return err(new AppError("FORBIDDEN", "Operar em conta real está desativado neste servidor. Use a conta demo."));
    }
    let entry = entries.get(userId);
    if (entry !== undefined && (entry.accountId !== account.accountId || entry.token !== token)) {
      if (isBusy(entry)) return err(new AppError("CONFLICT", "Pare os bots antes de mudar de conta."));
      dispose(userId);
      entry = undefined;
    }
    if (entry === undefined) {
      const session = new DerivSession({ token, accountId: account.accountId, accountType: account.accountType, log });
      const manager = new BotManager({ session, log, feeds: (symbol) => feedFor(symbol).stats });
      const created: Entry = { session, manager, accountId: account.accountId, token, trades: [], totals: {}, lastUsed: Date.now() };
      manager.on("trade", (trade: TradeRecord) => {
        created.trades.unshift(trade);
        if (created.trades.length > 200) created.trades.length = 200;
        const t = (created.totals[trade.botId] ??= { trades: 0, wins: 0, losses: 0, profit: 0, gain: 0, loss: 0 });
        t.trades += 1;
        if (trade.won) t.wins += 1; else t.losses += 1;
        t.profit = Math.round((t.profit + trade.profit) * 100) / 100;
        if (trade.profit > 0) t.gain = Math.round((t.gain + trade.profit) * 100) / 100;
        if (trade.profit < 0) t.loss = Math.round((t.loss - trade.profit) * 100) / 100;
      });
      entries.set(userId, created);
      entry = created;
    }
    entry.lastUsed = Date.now();
    return ok(entry);
  }

  async function connect(entry: Entry): Promise<Result<void>> {
    try {
      await entry.session.ready();
      return ok(undefined);
    } catch (cause) {
      return err(new AppError("UPSTREAM", "Não foi possível ligar à Deriv. Tente novamente.", { cause }));
    }
  }

  return {
    isRunnable: (botId) => PRESETS.some((preset) => preset.id === botId),

    async warmUp({ userId, token, account, symbol }) {
      const entry = ensure(userId, token, account);
      if (!entry.ok) return entry;
      const feed = feedFor(symbol);
      const [connected] = await Promise.all([connect(entry.value), feed.whenReady(5000)]);
      return connected;
    },

    async start({ userId, token, account, botId, overrides }) {
      const entry = ensure(userId, token, account);
      if (!entry.ok) return entry;
      const connected = await connect(entry.value);
      if (!connected.ok) return connected;
      // A 1.ª ordem já tem de sair analisada: espera (no máx. 5 s) pelos últimos dígitos e, num bot
      // inteligente, não arranca sem eles em vez de entrar às cegas.
      const feed = feedFor(overrides.symbol ?? "R_100");
      await feed.whenReady(5000);
      if (!feed.ready && PRESETS.find((p) => p.id === botId)?.adaptive === true) {
        return err(new AppError("UPSTREAM", "Sem dados do mercado para analisar. Tente novamente dentro de instantes."));
      }
      try {
        entry.value.manager.start(botId, overrides);
        return ok(undefined);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Configuração inválida.";
        return err(new AppError("VALIDATION", message, { cause }));
      }
    },

    async stop(userId, botId) {
      await entries.get(userId)?.manager.stop(botId);
    },

    state(userId) {
      const entry = entries.get(userId);
      if (entry === undefined) return { accountId: null, bots: [], trades: [], totals: {} };
      entry.lastUsed = Date.now();
      return { accountId: entry.accountId, bots: entry.manager.status(), trades: entry.trades, totals: entry.totals };
    },

    clearHistory(userId) {
      const entry = entries.get(userId);
      if (entry === undefined) return;
      entry.trades.length = 0;
      entry.totals = {};
    },

    async close() {
      clearInterval(sweeper);
      for (const held of feeds.values()) held.feed.stop();
      feeds.clear();
      for (const userId of [...entries.keys()]) dispose(userId);
    },
  };
}
