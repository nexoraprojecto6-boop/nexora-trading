// ============================================================
// NEXORA — Auth Context
//
// A sessão é um cookie HttpOnly gerido pelo servidor: o frontend não guarda
// tokens. Só se guarda no browser o id da conta ativa (não sensível).
// A verificação da sessão e o refresco dos saldos usam o mesmo pedido
// (GET /me/accounts), que também mantém a sessão "viva" para a contagem online.
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { api, HttpError, type LocalUser } from '../lib/api'
import { API_BASE_URL } from '../lib/env'
import { nav } from '../lib/navigation'
import type { Account } from '../lib/types'
import { pickAccount } from '../lib/accounts'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  /** Mensagem quando não foi possível verificar a sessão (rede, configuração). */
  sessionError: string | null
  accounts: Account[]
  currentAccount: Account | null
  /** `false` quando o token da Deriv expirou: contas visíveis, saldos indisponíveis. */
  derivLive: boolean
  setCurrentAccount: (account: Account) => Promise<void>
  logout: () => Promise<void>
  refreshAccounts: () => Promise<void>
  /** Confirma a sessão no servidor. Devolve `true` se há sessão. */
  refresh: () => Promise<boolean>
  // Compatibilidade com as páginas de administração (ainda sem servidor).
  isAdmin: boolean
  localUser: LocalUser | null
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ACCOUNT_KEY = 'currentAccountId'
const REFRESH_MS = 30_000

function readSavedAccount(): string | null {
  try { return localStorage.getItem(ACCOUNT_KEY) } catch { return null }
}
function saveAccount(id: string | null) {
  try { if (id) localStorage.setItem(ACCOUNT_KEY, id); else localStorage.removeItem(ACCOUNT_KEY) } catch { /* sem armazenamento */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [currentAccount, setCurrentAccountState] = useState<Account | null>(null)
  const [derivLive, setDerivLive] = useState(false)
  const currentIdRef = useRef<string | undefined>(undefined)
  const startedRef = useRef(false)

  const applyAccounts = useCallback((list: Account[], live: boolean) => {
    setAccounts(list)
    setDerivLive(live)
    const active = pickAccount(list, readSavedAccount(), currentIdRef.current)
    currentIdRef.current = active?.account_id
    setCurrentAccountState(active)
    saveAccount(active?.account_id ?? null)
  }, [])

  const clearSession = useCallback(() => {
    setIsAuthenticated(false)
    setAccounts([])
    setCurrentAccountState(null)
    setDerivLive(false)
    currentIdRef.current = undefined
  }, [])

  const refresh = useCallback(async (): Promise<boolean> => {
    if (API_BASE_URL === undefined) {
      setSessionError('Configuração em falta: define VITE_API_BASE_URL com o endereço https da API.')
      clearSession()
      return false
    }
    try {
      const res = await api.getAccounts()
      applyAccounts(res.accounts, res.live)
      setIsAuthenticated(true)
      setSessionError(null)
      return true
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        clearSession()
        setSessionError(null)
        return false
      }
      clearSession()
      setSessionError(e instanceof HttpError ? e.message : 'Não foi possível verificar a sessão.')
      return false
    }
  }, [applyAccounts, clearSession])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void refresh().finally(() => setIsLoading(false))
  }, [refresh])

  // Refresco periódico dos saldos (só com o separador visível). Uma falha de rede não termina a sessão.
  const refreshAccounts = useCallback(async () => {
    try {
      const res = await api.getAccounts()
      applyAccounts(res.accounts, res.live)
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) clearSession()
    }
  }, [applyAccounts, clearSession])

  useEffect(() => {
    if (!isAuthenticated) return
    const tick = () => { if (document.visibilityState === 'visible') void refreshAccounts() }
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [isAuthenticated, refreshAccounts])

  const setCurrentAccount = async (account: Account) => {
    currentIdRef.current = account.account_id
    setCurrentAccountState(account)
    saveAccount(account.account_id)
  }

  const logout = async () => {
    // O logout nunca pode ficar preso se o servidor estiver em baixo.
    try { await api.logout() } catch (e) { console.warn('[Auth] logout falhou (a limpar a sessão local):', e) }
    saveAccount(null)
    clearSession()
    nav.go('/')
  }

  return (
    <AuthContext.Provider value={{
      isAuthenticated, isLoading, sessionError, accounts, currentAccount, derivLive,
      setCurrentAccount, logout, refreshAccounts, refresh,
      isAdmin: false, localUser: null,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
