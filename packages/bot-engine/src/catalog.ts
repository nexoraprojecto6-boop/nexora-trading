import { AppError, err, ok, type Result } from "@nexora/shared";
import { decimalToMinorUnits, normalizeDecimal } from "./money.js";

/**
 * Definição de um parâmetro configurável. Valores monetários são texto decimal exato
 * (nunca número), para evitar erros de vírgula flutuante.
 */
export type ParamDef =
  | { readonly kind: "integer"; readonly key: string; readonly label: string; readonly help?: string; readonly min: number; readonly max: number; readonly default?: number }
  | { readonly kind: "decimal"; readonly key: string; readonly label: string; readonly help?: string; readonly min: string; readonly max: string; readonly default?: string }
  | { readonly kind: "select"; readonly key: string; readonly label: string; readonly help?: string; readonly options: readonly { readonly value: string; readonly label: string }[]; readonly default?: string }
  | { readonly kind: "symbol"; readonly key: string; readonly label: string; readonly help?: string; readonly default?: string };

export type ParamValues = Readonly<Record<string, string | number>>;

export interface BotDefinition {
  /** Identificador estável: minúsculas, números e hífen. */
  readonly id: string;
  readonly name: string;
  /** Uma linha, mostrada na lista. */
  readonly summary: string;
  /** Texto completo, mostrado em "Descrição". */
  readonly description: string;
  readonly params: readonly ParamDef[];
}

/**
 * Limites de risco comuns a todos os bots. NÃO têm valores por omissão:
 * o utilizador tem de os definir explicitamente antes de um bot poder operar.
 */
export const RISK_PARAMS: readonly ParamDef[] = [
  { kind: "decimal", key: "stake", label: "Valor por operação", help: "Montante de cada operação, na moeda da conta.", min: "0.01", max: "100000" },
  { kind: "decimal", key: "maxDailyLoss", label: "Perda máxima por dia", help: "O robô pára quando o risco do dia atingir este valor (conta o valor em risco nas operações abertas).", min: "0.01", max: "1000000" },
  { kind: "integer", key: "maxTradesPerDay", label: "Operações por dia (máx.)", min: 1, max: 1000 },
  { kind: "integer", key: "maxOpenPositions", label: "Operações abertas ao mesmo tempo (máx.)", min: 1, max: 10 },
  { kind: "integer", key: "maxConsecutiveLosses", label: "Perdas seguidas até parar", help: "Ao atingir este número, o robô pára e só retoma por ação sua.", min: 1, max: 50 },
  { kind: "integer", key: "cooldownSeconds", label: "Espera entre operações (segundos)", min: 0, max: 86400 },
];

/**
 * Catálogo de bots do servidor. Só entra aqui quem tem acesso ao repositório.
 * Nenhum bot deste catálogo promete lucro.
 */
const DIGIT_PARAMS: readonly ParamDef[] = [
  { kind: "symbol", key: "symbol", label: "Símbolo", help: "Mercado sintético (ex.: R_100).", default: "R_100" },
];

export const BOT_CATALOG: readonly BotDefinition[] = [
  {
    id: "observador",
    name: "Observador (demonstração)",
    summary: "Acompanha os candles de um símbolo. Não abre operações.",
    description:
      "Bot de demonstração para testar a escolha, a configuração e o painel. " +
      "Acompanha os candles do símbolo escolhido e NÃO abre operações nem usa dinheiro. " +
      "Não é uma estratégia de trading e não promete qualquer resultado.",
    params: [
      { kind: "symbol", key: "symbol", label: "Símbolo", help: "Código do mercado (ex.: R_100).", default: "R_100" },
      {
        kind: "select",
        key: "candleSeconds",
        label: "Duração do candle",
        options: [
          { value: "60", label: "1 minuto" },
          { value: "120", label: "2 minutos" },
          { value: "300", label: "5 minutos" },
        ],
        default: "60",
      },
    ],
  },
  {
    id: "digit-3",
    name: "Dígito 3 (Differs)",
    summary: "Aposta que o último dígito NÃO é 3.",
    description:
      "Compra DIGITDIFF com barreira 3. Contratos de 1 tick: a primeira ordem sai assim que carrega em Play (a ligação à Deriv é preparada antes) e a seguinte logo que a anterior termina, até atingir um limite de risco. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
  },
  {
    id: "digit-1",
    name: "Dígito 1 (Differs)",
    summary: "Aposta que o último dígito NÃO é 1.",
    description:
      "Compra DIGITDIFF com barreira 1. Contratos de 1 tick: a primeira ordem sai assim que carrega em Play (a ligação à Deriv é preparada antes) e a seguinte logo que a anterior termina, até atingir um limite de risco. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
  },
  {
    id: "over-5",
    name: "Acima de 5 (Over 5)",
    summary: "Aposta que o último dígito é maior que 5.",
    description:
      "Compra DIGITOVER com barreira 5. Contratos de 1 tick: a primeira ordem sai assim que carrega em Play (a ligação à Deriv é preparada antes) e a seguinte logo que a anterior termina, até atingir um limite de risco. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
  },
  {
    id: "under-8",
    name: "Abaixo de 8 (Under 8)",
    summary: "Aposta que o último dígito é menor que 8.",
    description:
      "Compra DIGITUNDER com barreira 8. Contratos de 1 tick: a primeira ordem sai assim que carrega em Play (a ligação à Deriv é preparada antes) e a seguinte logo que a anterior termina, até atingir um limite de risco. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
  },
  {
    id: "even",
    name: "Pares (Even)",
    summary: "Aposta que o último dígito é par.",
    description:
      "Compra DIGITEVEN. Contratos de 1 tick: a primeira ordem sai assim que carrega em Play (a ligação à Deriv é preparada antes) e a seguinte logo que a anterior termina, até atingir um limite de risco. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
  },
  {
    id: "odd",
    name: "Ímpares (Odd)",
    summary: "Aposta que o último dígito é ímpar.",
    description:
      "Compra DIGITODD. Contratos de 1 tick: a primeira ordem sai assim que carrega em Play (a ligação à Deriv é preparada antes) e a seguinte logo que a anterior termina, até atingir um limite de risco. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
  },
];

export function findBot(id: string): BotDefinition | undefined {
  return BOT_CATALOG.find((bot) => bot.id === id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toMinor8(text: string): number {
  const result = decimalToMinorUnits(text, 8);
  return result.ok ? result.value : Number.NaN;
}

function validateOne(def: ParamDef, raw: unknown): { value: string | number } | { error: string } {
  switch (def.kind) {
    case "integer": {
      const n = typeof raw === "string" && /^-?\d{1,15}$/.test(raw) ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isSafeInteger(n)) return { error: "Tem de ser um número inteiro." };
      if (n < def.min || n > def.max) return { error: `Tem de estar entre ${def.min} e ${def.max}.` };
      return { value: n };
    }
    case "decimal": {
      const text = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : raw;
      if (typeof text !== "string" || !/^\d{1,12}(\.\d{1,8})?$/.test(text)) return { error: "Valor inválido (use números, com ponto decimal)." };
      const minor = toMinor8(text);
      if (!(minor >= toMinor8(def.min)) || !(minor <= toMinor8(def.max))) return { error: `Tem de estar entre ${def.min} e ${def.max}.` };
      return { value: normalizeDecimal(text) };
    }
    case "select": {
      if (typeof raw !== "string" || !def.options.some((option) => option.value === raw)) return { error: "Escolha uma das opções." };
      return { value: raw };
    }
    case "symbol": {
      if (typeof raw !== "string" || !/^[A-Za-z0-9_]{1,32}$/.test(raw)) return { error: "Símbolo inválido (letras, números e _; até 32)." };
      return { value: raw };
    }
  }
}

/** Valida e normaliza valores contra as definições. Rejeita chaves desconhecidas e valores em falta (sem padrão). */
export function validateParams(defs: readonly ParamDef[], input: unknown, prefix = ""): Result<ParamValues> {
  const errors: Record<string, string> = {};
  const values: Record<string, string | number> = {};
  if (!isRecord(input)) {
    return err(new AppError("VALIDATION", "Parâmetros inválidos.", { details: { errors: { [`${prefix}*`]: "Valores em falta." } } }));
  }
  const known = new Set(defs.map((def) => def.key));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) errors[`${prefix}${key}`] = "Parâmetro desconhecido.";
  }
  for (const def of defs) {
    const provided = Object.hasOwn(input, def.key) ? input[def.key] : undefined;
    const raw = provided === undefined || provided === "" ? def.default : provided;
    if (raw === undefined) {
      errors[`${prefix}${def.key}`] = "Obrigatório.";
      continue;
    }
    const result = validateOne(def, raw);
    if ("error" in result) errors[`${prefix}${def.key}`] = result.error;
    else values[def.key] = result.value;
  }
  if (Object.keys(errors).length > 0) {
    return err(new AppError("VALIDATION", "Parâmetros inválidos.", { details: { errors } }));
  }
  return ok(values);
}

export interface BotConfig {
  readonly params: ParamValues;
  readonly risk: ParamValues;
}

/** Valida a configuração completa de um bot: parâmetros do bot + limites de risco obrigatórios. */
export function validateBotConfig(bot: BotDefinition, input: unknown): Result<BotConfig> {
  if (!isRecord(input)) {
    return err(new AppError("VALIDATION", "Configuração inválida.", { details: { errors: { "*": "Configuração em falta." } } }));
  }
  const params = validateParams(bot.params, input["params"] ?? {}, "params.");
  const risk = validateParams(RISK_PARAMS, input["risk"], "risk.");
  const errors: Record<string, string> = {
    ...(!params.ok ? ((params.error.details?.["errors"] as Record<string, string> | undefined) ?? {}) : {}),
    ...(!risk.ok ? ((risk.error.details?.["errors"] as Record<string, string> | undefined) ?? {}) : {}),
  };
  if (params.ok && risk.ok) {
    const stake = toMinor8(String(risk.value["stake"]));
    const maxDailyLoss = toMinor8(String(risk.value["maxDailyLoss"]));
    if (maxDailyLoss < stake) errors["risk.maxDailyLoss"] = "Tem de ser igual ou superior ao valor por operação.";
  }
  if (Object.keys(errors).length > 0) {
    return err(new AppError("VALIDATION", "Configuração inválida.", { details: { errors } }));
  }
  if (!params.ok || !risk.ok) return err(new AppError("INTERNAL", "Estado de validação inconsistente."));
  return ok({ params: params.value, risk: risk.value });
}
