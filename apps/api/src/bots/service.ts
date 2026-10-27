import type pg from "pg";
import { BOT_CATALOG, findBot, validateBotConfig, type BotConfig, type BotDefinition } from "@nexora/bot-engine";
import { AppError, err, ok, type Result } from "@nexora/shared";

export interface UserBotState {
  readonly selectedBotId: string | null;
  /** Configuração guardada do bot selecionado, se existir. */
  readonly config: BotConfig | null;
}

export interface BotService {
  list(): readonly BotDefinition[];
  get(id: string): BotDefinition | undefined;
  getUserState(userId: string): Promise<Result<UserBotState>>;
  select(userId: string, botId: string): Promise<Result<void>>;
  saveConfig(userId: string, botId: string, input: unknown): Promise<Result<BotConfig>>;
}

const DB_FAILED = "Erro ao aceder à base de dados.";

export function createBotService(pool: pg.Pool): BotService {
  return {
    list: () => BOT_CATALOG,
    get: (id) => findBot(id),

    async getUserState(userId) {
      try {
        const selected = await pool.query<{ bot_id: string }>("select bot_id from user_selected_bot where user_id = $1", [userId]);
        const selectedBotId = selected.rows[0]?.bot_id ?? null;
        // Se o bot foi retirado do catálogo, a seleção deixa de valer.
        const bot = selectedBotId !== null ? findBot(selectedBotId) : undefined;
        if (selectedBotId === null || bot === undefined) return ok({ selectedBotId: null, config: null });

        const row = await pool.query<{ params: unknown; risk: unknown }>(
          "select params, risk from user_bot_configs where user_id = $1 and bot_id = $2",
          [userId, selectedBotId],
        );
        const stored = row.rows[0];
        if (stored === undefined) return ok({ selectedBotId, config: null });
        // Revalida: se o catálogo mudou desde que foi guardada, a configuração antiga deixa de ser usada.
        const valid = validateBotConfig(bot, { params: stored.params, risk: stored.risk });
        return ok({ selectedBotId, config: valid.ok ? valid.value : null });
      } catch (cause) {
        return err(new AppError("INTERNAL", DB_FAILED, { cause }));
      }
    },

    async select(userId, botId) {
      if (findBot(botId) === undefined) return err(new AppError("NOT_FOUND", "Bot não encontrado."));
      try {
        await pool.query(
          `insert into user_selected_bot (user_id, bot_id) values ($1, $2)
           on conflict (user_id) do update set bot_id = excluded.bot_id`,
          [userId, botId],
        );
        return ok(undefined);
      } catch (cause) {
        return err(new AppError("INTERNAL", DB_FAILED, { cause }));
      }
    },

    async saveConfig(userId, botId, input) {
      const bot = findBot(botId);
      if (bot === undefined) return err(new AppError("NOT_FOUND", "Bot não encontrado."));
      const valid = validateBotConfig(bot, input);
      if (!valid.ok) return valid;
      try {
        await pool.query(
          `insert into user_bot_configs (user_id, bot_id, params, risk) values ($1, $2, $3::jsonb, $4::jsonb)
           on conflict (user_id, bot_id) do update set params = excluded.params, risk = excluded.risk`,
          [userId, botId, JSON.stringify(valid.value.params), JSON.stringify(valid.value.risk)],
        );
        return ok(valid.value);
      } catch (cause) {
        return err(new AppError("INTERNAL", DB_FAILED, { cause }));
      }
    },
  };
}
