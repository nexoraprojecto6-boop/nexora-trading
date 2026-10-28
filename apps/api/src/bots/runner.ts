import { AppError, err, ok, type Result } from "@nexora/shared";
import { BotManager, DerivSession, PRESETS, type BotConfig, type BotStats, type TradeRecord } from "../digit-bots/index.js";

export interface RunnerAccount {
  readonly accountId: string;
  readonly accountType: "demo" | "real";
}

export interface LiveState {
  readonly accountId: string | null;
  readonly bots: BotStats[];
  readonly trades: TradeRecord[];
}

export interface BotRunner {
  /** Ids dos bots que realmente operam. */
  isRunnable(botId: string): boolean;
  /** Abre a ligação à Deriv antes do Play, para a primeira ordem sair sem esperar. */
  warmUp(input: { userId: string; token: string; account: RunnerAccount }): Promise<Result<void>>;
  start(input: { userId: string; token: string; account: RunnerAccount; botId: string; overrides: Partial<BotConfig> }): Promise<Result<void>>;
  stop(userId: string, botId: string): Promise<void>;
  state(userId: string): LiveState;
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

  const sweeper = setInterval(() => {
    const now = Date.now();
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
      const manager = new BotManager({ session, log });
      const created: Entry = { session, manager, accountId: account.accountId, token, trades: [], lastUsed: Date.now() };
      manager.on("trade", (trade: TradeRecord) => {
        created.trades.unshift(trade);
        if (created.trades.length > 200) created.trades.length = 200;
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

    async warmUp({ userId, token, account }) {
      const entry = ensure(userId, token, account);
      if (!entry.ok) return entry;
      return connect(entry.value);
    },

    async start({ userId, token, account, botId, overrides }) {
      const entry = ensure(userId, token, account);
      if (!entry.ok) return entry;
      const connected = await connect(entry.value);
      if (!connected.ok) return connected;
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
      if (entry === undefined) return { accountId: null, bots: [], trades: [] };
      entry.lastUsed = Date.now();
      return { accountId: entry.accountId, bots: entry.manager.status(), trades: entry.trades };
    },

    async close() {
      clearInterval(sweeper);
      for (const userId of [...entries.keys()]) dispose(userId);
    },
  };
}
