import type { Account } from './types'

/** Conta ativa: a atual se ainda existir; senão a guardada; senão a primeira demo (mais seguro); senão a primeira. */
export function pickAccount(accounts: Account[], savedId: string | null, currentId?: string): Account | null {
  if (accounts.length === 0) return null
  const keep = (currentId && accounts.find(a => a.account_id === currentId))
    || (savedId && accounts.find(a => a.account_id === savedId))
  return keep || accounts.find(a => a.is_virtual) || accounts[0] || null
}
