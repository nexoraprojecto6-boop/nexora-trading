export interface Account {
  readonly accountId: string;
  readonly accountType: "demo" | "real";
  readonly currency: string;
  readonly status: "active" | "inactive";
}

export interface User {
  readonly id: string;
  readonly accounts: readonly Account[];
}

export type SessionState =
  | { readonly kind: "anonymous" }
  | { readonly kind: "authenticated"; readonly user: User }
  | { readonly kind: "error"; readonly message: string };

/** Normaliza a base da API: só aceita URLs absolutos https (ou http em localhost). */
export function normalizeApiBase(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return undefined;
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return undefined;
  return url.toString().replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUser(body: unknown): User | undefined {
  if (!isRecord(body) || !isRecord(body["user"])) return undefined;
  const { id, accounts } = body["user"];
  if (typeof id !== "string" || !Array.isArray(accounts)) return undefined;
  const parsed: Account[] = [];
  for (const item of accounts as unknown[]) {
    if (!isRecord(item)) return undefined;
    const { accountId, accountType, currency, status } = item;
    if (
      typeof accountId !== "string" ||
      (accountType !== "demo" && accountType !== "real") ||
      typeof currency !== "string" ||
      (status !== "active" && status !== "inactive")
    ) {
      return undefined;
    }
    parsed.push({ accountId, accountType, currency, status });
  }
  return { id, accounts: parsed };
}

export interface ApiClient {
  readonly loginUrl: string;
  fetchSession(): Promise<SessionState>;
  logout(): Promise<boolean>;
}

/** Cliente da API. Os cookies de sessão são HttpOnly: o frontend nunca vê tokens. */
export function createApiClient(base: string, fetchFn: typeof fetch = (...args) => fetch(...args)): ApiClient {
  return {
    loginUrl: `${base}/auth/login`,

    async fetchSession() {
      try {
        const response = await fetchFn(`${base}/me`, { credentials: "include", headers: { Accept: "application/json" } });
        if (response.status === 401) return { kind: "anonymous" };
        if (response.status === 503) return { kind: "error", message: "A autenticação ainda não está configurada no servidor." };
        if (!response.ok) return { kind: "error", message: "Não foi possível verificar a sessão. Tenta novamente." };
        const user = parseUser(await response.json());
        if (user === undefined) return { kind: "error", message: "Resposta inesperada do servidor." };
        return { kind: "authenticated", user };
      } catch {
        return { kind: "error", message: "Não foi possível contactar o servidor. Tenta novamente." };
      }
    },

    async logout() {
      try {
        const response = await fetchFn(`${base}/auth/logout`, { method: "POST", credentials: "include" });
        return response.status === 204 || response.ok;
      } catch {
        return false;
      }
    },
  };
}
