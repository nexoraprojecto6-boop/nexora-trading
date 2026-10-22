export interface CookieOptions {
  readonly maxAgeSeconds: number;
  readonly secure: boolean;
}

/** Lê o cabeçalho Cookie. Ignora entradas malformadas. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (header === undefined || header.length > 4096) return result;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name !== "" && !(name in result)) result[name] = value;
  }
  return result;
}

const SAFE_VALUE = /^[A-Za-z0-9_-]*$/;

/** Cookie de sessão: HttpOnly, SameSite=Lax, Path=/. Só aceita valores base64url. */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name) && !/^__Host-[A-Za-z0-9_-]+$/.test(name)) throw new Error("Nome de cookie inválido.");
  if (!SAFE_VALUE.test(value)) throw new Error("Valor de cookie inválido.");
  const parts = [`${name}=${value}`, "Path=/", `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`, "HttpOnly", "SameSite=Lax"];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  return serializeCookie(name, "", { maxAgeSeconds: 0, secure });
}

export function cookieNames(secure: boolean): { session: string; oauth: string } {
  const prefix = secure ? "__Host-" : "";
  return { session: `${prefix}nx_session`, oauth: `${prefix}nx_oauth` };
}
