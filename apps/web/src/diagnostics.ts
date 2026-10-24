export interface CspViolation {
  readonly directive: string;
  readonly blockedUri: string;
}

/** Violações de CSP registadas pelo browser (úteis quando o site não consegue contactar a API). */
export const cspViolations: CspViolation[] = [];

export function recordCspViolations(doc: Document): void {
  doc.addEventListener("securitypolicyviolation", (event) => {
    if (cspViolations.length < 20) {
      cspViolations.push({ directive: event.violatedDirective, blockedUri: event.blockedURI });
    }
  });
}

export interface DiagnosticsInput {
  readonly base: string;
  readonly pageOrigin: string;
  readonly buildTime: string;
  readonly fetchFn: typeof fetch;
  readonly violations: readonly CspViolation[];
}

/**
 * Testa a ligação à API por passos e devolve linhas legíveis.
 * Só mostra endereços públicos (origem da página e da API): nunca cookies nem tokens.
 */
export async function diagnose(input: DiagnosticsInput): Promise<string[]> {
  const { base, pageOrigin, buildTime, fetchFn, violations } = input;
  const lines = [`Versão do site: ${buildTime}`, `Origem da página: ${pageOrigin}`, `API configurada: ${base}`];

  if (violations.length > 0) {
    for (const violation of violations.slice(0, 5)) {
      lines.push(`CSP bloqueou: ${violation.directive} -> ${violation.blockedUri}`);
    }
  } else {
    lines.push("CSP: nenhuma violação registada");
  }

  // 1) Ligação básica (resposta opaca): falha com DNS, rede ou CSP.
  try {
    await fetchFn(`${base}/health`, { mode: "no-cors", cache: "no-store" });
    lines.push("1) Ligação à API: OK");
  } catch {
    lines.push("1) Ligação à API: FALHOU (endereço inexistente, rede ou CSP)");
    return lines;
  }

  // 2) CORS sem cookies: falha se WEB_ORIGIN no servidor não coincidir com a origem da página.
  try {
    const response = await fetchFn(`${base}/health`, { cache: "no-store" });
    lines.push(`2) CORS: OK (estado ${response.status})`);
  } catch {
    lines.push(`2) CORS: BLOQUEADO. No Render, WEB_ORIGIN tem de ser exatamente ${pageOrigin}`);
    return lines;
  }

  // 3) Pedido com cookies, como faz o site.
  try {
    const response = await fetchFn(`${base}/me`, { credentials: "include", cache: "no-store" });
    lines.push(`3) /me com cookies: OK (estado ${response.status}; 401 é normal antes do login)`);
  } catch {
    lines.push("3) /me com cookies: FALHOU (CORS com credenciais)");
  }
  return lines;
}
