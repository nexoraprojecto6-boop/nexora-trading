import { AppError, err, ok, type Result } from "@nexora/shared";
import { decimalToMinorUnits, normalizeDecimal } from "./money.js";

/**
 * Definição de um parâmetro configurável. Valores monetários são texto decimal exato
 * (nunca número), para evitar erros de vírgula flutuante.
 */
export type ParamDef =
  | { readonly kind: "integer"; readonly key: string; readonly label: string; readonly help?: string; readonly placeholder?: string; readonly min: number; readonly max: number; readonly default?: number }
  | { readonly kind: "decimal"; readonly key: string; readonly label: string; readonly help?: string; readonly placeholder?: string; readonly min: string; readonly max: string; readonly default?: string }
  | { readonly kind: "select"; readonly key: string; readonly label: string; readonly help?: string; readonly placeholder?: string; readonly options: readonly { readonly value: string; readonly label: string }[]; readonly default?: string }
  | { readonly kind: "symbol"; readonly key: string; readonly label: string; readonly help?: string; readonly placeholder?: string; readonly default?: string };

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
  /** Limites de risco próprios do bot. Sem isto, usa RISK_PARAMS. */
  readonly riskParams?: readonly ParamDef[];
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
  { kind: "symbol", key: "symbol", label: "Mercado", default: "R_100" },
];

/** Os 3 campos que importam nos bots de dígitos. Sem valor por omissão: o utilizador preenche. */
const DIGIT_RISK: readonly ParamDef[] = [
  { kind: "decimal", key: "stake", label: "Stake inicial", min: "0.35", max: "100000", placeholder: "Ex.: 1.00 (valor de cada operação)" },
  { kind: "decimal", key: "takeProfit", label: "Take profit", min: "0.01", max: "1000000", placeholder: "Ex.: 10.00 (pára ao ganhar este valor)" },
  { kind: "decimal", key: "stopLoss", label: "Stop loss", min: "0.01", max: "1000000", placeholder: "Ex.: 20.00 (pára ao perder este valor)" },
];

export const BOT_CATALOG: readonly BotDefinition[] = [
  {
    id: "even-odd",
    name: "Pares/Ímpares (inteligente)",
    summary: "Escolhe pares ou ímpares conforme a percentagem recente.",
    description:
      "ENTRADA: Pares (DIGITEVEN) ou Ímpares (DIGITODD). ANÁLISE: antes de cada ordem compara a percentagem de dígitos pares e ímpares nos últimos 100 ticks (os últimos 20 pesam mais) e entra no lado mais forte. " +
      "Contratos de 1 tick: a ligação e a análise dos últimos 100 dígitos ficam prontas antes do Play, por isso a primeira ordem sai logo que carrega e a seguinte entra assim que a anterior termina. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
    riskParams: DIGIT_RISK,
  },
  {
    id: "over-3",
    name: "Superior a 3 (Over 3)",
    summary: "Aposta que o próximo dígito é maior que 3.",
    description:
      "ENTRADA: DIGITOVER com barreira 3 (ganha se o dígito final for 4 a 9). Sem análise: entra sempre neste contrato. " +
      "Contratos de 1 tick: a ligação e a análise dos últimos 100 dígitos ficam prontas antes do Play, por isso a primeira ordem sai logo que carrega e a seguinte entra assim que a anterior termina. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
    riskParams: DIGIT_RISK,
  },
  {
    id: "over-1",
    name: "Superior a 1 (Over 1)",
    summary: "Aposta que o próximo dígito é maior que 1.",
    description:
      "ENTRADA: DIGITOVER com barreira 1 (ganha se o dígito final for 2 a 9). Sem análise: entra sempre neste contrato. " +
      "Contratos de 1 tick: a ligação e a análise dos últimos 100 dígitos ficam prontas antes do Play, por isso a primeira ordem sai logo que carrega e a seguinte entra assim que a anterior termina. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
    riskParams: DIGIT_RISK,
  },
  {
    id: "over3-under3",
    name: "Superior/Inferior a 3 (inteligente)",
    summary: "Alterna entre acima e abaixo de 3 conforme a percentagem.",
    description:
      "ENTRADA: Superior a 3 (dígitos 4 a 9) ou Inferior a 3 (dígitos 0 a 2). ANÁLISE: antes de cada ordem vê qual dos dois lados está mais forte, face ao normal, nos últimos 100 ticks (os últimos 20 pesam mais) e entra nesse. " +
      "Contratos de 1 tick: a ligação e a análise dos últimos 100 dígitos ficam prontas antes do Play, por isso a primeira ordem sai logo que carrega e a seguinte entra assim que a anterior termina. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
    riskParams: DIGIT_RISK,
  },
  {
    id: "under-8",
    name: "Abaixo de 8 (Under 8)",
    summary: "Aposta que o próximo dígito é menor que 8.",
    description:
      "ENTRADA: DIGITUNDER com barreira 8 (ganha se o dígito final for 0 a 7). Sem análise: entra sempre neste contrato. " +
      "Contratos de 1 tick: a ligação e a análise dos últimos 100 dígitos ficam prontas antes do Play, por isso a primeira ordem sai logo que carrega e a seguinte entra assim que a anterior termina. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
    riskParams: DIGIT_RISK,
  },
  {
    id: "under8-over7",
    name: "Abaixo de 8 / Acima de 7 (inteligente)",
    summary: "Alterna entre abaixo de 8 e acima de 7 conforme a percentagem.",
    description:
      "ENTRADA: Abaixo de 8 (dígitos 0 a 7) ou Acima de 7 (dígitos 8 e 9). ANÁLISE: antes de cada ordem vê qual dos dois lados está mais forte, face ao normal, nos últimos 100 ticks (os últimos 20 pesam mais) e entra nesse. " +
      "Contratos de 1 tick: a ligação e a análise dos últimos 100 dígitos ficam prontas antes do Play, por isso a primeira ordem sai logo que carrega e a seguinte entra assim que a anterior termina. " +
      "Pode perder dinheiro; nenhum bot garante lucro.",
    params: DIGIT_PARAMS,
    riskParams: DIGIT_RISK,
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
  const risk = validateParams(bot.riskParams ?? RISK_PARAMS, input["risk"], "risk.");
  const errors: Record<string, string> = {
    ...(!params.ok ? ((params.error.details?.["errors"] as Record<string, string> | undefined) ?? {}) : {}),
    ...(!risk.ok ? ((risk.error.details?.["errors"] as Record<string, string> | undefined) ?? {}) : {}),
  };
  if (params.ok && risk.ok) {
    const stake = toMinor8(String(risk.value["stake"]));
    const capKey = risk.value["maxDailyLoss"] !== undefined ? "maxDailyLoss" : "stopLoss";
    const cap = risk.value[capKey];
    if (cap !== undefined && toMinor8(String(cap)) < stake) errors[`risk.${capKey}`] = "Tem de ser igual ou superior ao valor por operação.";
  }
  if (Object.keys(errors).length > 0) {
    return err(new AppError("VALIDATION", "Configuração inválida.", { details: { errors } }));
  }
  if (!params.ok || !risk.ok) return err(new AppError("INTERNAL", "Estado de validação inconsistente."));
  return ok({ params: params.value, risk: risk.value });
}
