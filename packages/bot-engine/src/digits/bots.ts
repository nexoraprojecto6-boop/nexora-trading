import type { ContractType } from "./types.js";
import type { DigitWindow } from "./digit-window.js";

export interface BotDef {
  id: string;
  contract: ContractType;
  barrier?: string;
  /** scalper = entra a cada tick que cumpre a condição, sem esperar resultado e sem martingale. */
  mode: "sequential" | "scalper";
  /** Filtro rápido (O(1)/O(20)). A PRIMEIRA entrada ao clicar ignora o filtro, excepto no scalper. */
  shouldEnter(w: DigitWindow, lastDigit: number): boolean;
}

export const BOTS: Record<string, BotDef> = {
  // Scalper: Acima de 3 (DIGITOVER 3). Entra só se o último dígito < 3, em cada tick.
  scalper_over3: {
    id: "scalper_over3", contract: "DIGITOVER", barrier: "3", mode: "scalper",
    shouldEnter: (_w, d) => d < 3,
  },
  digit3: {
    id: "digit3", contract: "DIGITMATCH", barrier: "3", mode: "sequential",
    shouldEnter: (w) => w.count(3) >= 6, // dígito "quente" nos últimos 50 (média = 5)
  },
  digit1: {
    id: "digit1", contract: "DIGITMATCH", barrier: "1", mode: "sequential",
    shouldEnter: (w) => w.count(1) >= 6,
  },
  over5: {
    id: "over5", contract: "DIGITOVER", barrier: "5", mode: "sequential",
    shouldEnter: (w) => w.share((d) => d > 5, 20) >= 0.45,
  },
  under8: {
    id: "under8", contract: "DIGITUNDER", barrier: "8", mode: "sequential",
    shouldEnter: (w) => w.share((d) => d < 8, 20) >= 0.85,
  },
  even: {
    id: "even", contract: "DIGITEVEN", mode: "sequential",
    shouldEnter: (w) => w.share((d) => d % 2 === 0, 10) >= 0.6,
  },
  odd: {
    id: "odd", contract: "DIGITODD", mode: "sequential",
    shouldEnter: (w) => w.share((d) => d % 2 === 1, 10) >= 0.6,
  },
};
