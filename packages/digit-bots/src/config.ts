import type { SessionOptions } from './session.js';

export interface EnvConfig extends SessionOptions {
  symbol: string;
}

/** Lê a configuração do ambiente. Conta real só é aceite com DERIV_ALLOW_REAL=yes. */
export function loadEnvConfig(env: Record<string, string | undefined> = process.env): EnvConfig {
  const token = env.DERIV_TOKEN?.trim();
  if (!token) throw new Error('Defina DERIV_TOKEN (OAuth Bearer ou PAT com scope "trade").');

  const accountType = (env.DERIV_ACCOUNT_TYPE ?? 'demo').toLowerCase();
  if (accountType !== 'demo' && accountType !== 'real') {
    throw new Error('DERIV_ACCOUNT_TYPE deve ser "demo" ou "real".');
  }
  if (accountType === 'real' && env.DERIV_ALLOW_REAL !== 'yes') {
    throw new Error(
      'Conta real bloqueada. Teste primeiro em demo; para operar em real defina DERIV_ALLOW_REAL=yes.',
    );
  }

  return {
    token,
    appId: env.DERIV_APP_ID?.trim() || undefined,
    accountId: env.DERIV_ACCOUNT_ID?.trim() || undefined,
    accountType,
    symbol: env.BOT_SYMBOL?.trim() || 'R_100',
  };
}
