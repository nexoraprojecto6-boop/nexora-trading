import { DerivApiError } from './errors.js';

export const DEFAULT_REST_BASE = 'https://api.derivws.com';

export interface AuthOptions {
  /** OAuth Bearer token ou Personal Access Token (scope "trade"). */
  token: string;
  /** Obrigatório ao usar PAT. */
  appId?: string;
  restBase?: string;
  fetchFn?: typeof fetch;
}

export interface DerivAccount {
  account_id: string;
  balance: number;
  currency: string;
  group: string;
  status: 'active' | 'inactive';
  account_type: 'demo' | 'real';
}

function headers(o: AuthOptions): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${o.token}`,
    'Content-Type': 'application/json',
  };
  if (o.appId) h['Deriv-App-ID'] = o.appId;
  return h;
}

async function parse(res: Response): Promise<any> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* corpo vazio ou não-JSON */
  }
  if (!res.ok) {
    const e = body?.errors?.[0];
    throw new DerivApiError(e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText);
  }
  return body;
}

/** GET /trading/v1/options/accounts */
export async function fetchAccounts(o: AuthOptions): Promise<DerivAccount[]> {
  const f = o.fetchFn ?? fetch;
  const res = await f(`${o.restBase ?? DEFAULT_REST_BASE}/trading/v1/options/accounts`, {
    method: 'GET',
    headers: headers(o),
  });
  const body = await parse(res);
  return (body?.data ?? []) as DerivAccount[];
}

/** POST /trading/v1/options/accounts/{accountId}/otp -> URL do WebSocket já autenticado. */
export async function fetchOtpUrl(o: AuthOptions, accountId: string): Promise<string> {
  const f = o.fetchFn ?? fetch;
  const res = await f(
    `${o.restBase ?? DEFAULT_REST_BASE}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    { method: 'POST', headers: headers(o) },
  );
  const body = await parse(res);
  const url = body?.data?.url;
  if (typeof url !== 'string') throw new DerivApiError('InvalidOtpResponse', 'Resposta OTP sem URL');
  return url;
}

export function pickAccount(
  accounts: DerivAccount[],
  type: 'demo' | 'real',
  accountId?: string,
): DerivAccount {
  const wanted = accountId
    ? accounts.find((a) => a.account_id === accountId)
    : accounts.find((a) => a.account_type === type && a.status === 'active');
  if (!wanted) {
    throw new DerivApiError(
      'AccountNotFound',
      accountId
        ? `Conta ${accountId} não encontrada`
        : `Nenhuma conta ${type} ativa encontrada`,
    );
  }
  if (wanted.account_type !== type) {
    throw new DerivApiError(
      'AccountTypeMismatch',
      `A conta ${wanted.account_id} é ${wanted.account_type}, mas DERIV_ACCOUNT_TYPE=${type}`,
    );
  }
  return wanted;
}
