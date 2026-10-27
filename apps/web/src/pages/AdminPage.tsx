import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLoader } from '../context/LoaderContext'
import { api, DerivTokenExpiredError } from '../lib/api'
import type { AdminStats, AdminUserRow, MarkupStatisticsData } from '../lib/api'
import type { AdminNotification } from '../lib/types'

type Tab = 'todos' | 'nao_verificados' | 'bloqueados' | 'online' | 'novos_hoje' | 'inativos'
type CommissionFilterMode = 'mes' | 'intervalo'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function formatDate(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// YYYY-MM-DD a partir de um objeto Date, em hora local
function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function formatUsd(v: number): string {
  return `$${v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// "1 de julho a 14 de julho de 2026" / mesmo mês evita repetir o ano duas vezes
function formatPeriod(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00`)
  const t = new Date(`${to}T00:00:00`)
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) })
  return `${fmt(f, f.getFullYear() !== t.getFullYear())} — ${fmt(t, true)}`
}

// ── Ícones inline (sem emoji) ───────────────────────────────
function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function IconAlertTriangle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconExternalLink() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
function IconShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
function IconUsers2() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function IconBellSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px', flex: '1 1 120px', minWidth: 120 }}>
      <p style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </p>
      <p className="tabular" style={{ color: color || 'var(--white)', fontSize: 22, fontWeight: 700 }}>
        {value}
      </p>
    </div>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const { localUser } = useAuth()
  const { show, complete, hide } = useLoader()

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [tab, setTab] = useState<Tab>('todos')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null)

  // ── Relatório de comissão (Deriv markup-statistics) ─────────
  const [markup, setMarkup] = useState<MarkupStatisticsData | null>(null)
  const [markupLoading, setMarkupLoading] = useState(false)
  const [markupError, setMarkupError] = useState<string | null>(null)
  const [markupTokenExpired, setMarkupTokenExpired] = useState(false)

  // ── Gestão de notificações (broadcast) ──────────────────────
  const [notifList, setNotifList] = useState<AdminNotification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [notifSending, setNotifSending] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)
  const [notifDeletingId, setNotifDeletingId] = useState<string | null>(null)

  const todayDate = useMemo(() => new Date(), [])
  const [filterMode, setFilterMode] = useState<CommissionFilterMode>('mes')
  const [selMonth, setSelMonth] = useState(todayDate.getMonth() + 1)
  const [selYear, setSelYear] = useState(todayDate.getFullYear())
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toDateInput(d)
  })
  const [dateTo, setDateTo] = useState(() => toDateInput(new Date()))

  const yearOptions = useMemo(() => {
    const current = todayDate.getFullYear()
    return Array.from({ length: 5 }, (_, i) => current - i)
  }, [todayDate])

  const isAdmin = localUser?.role === 'admin'

  useEffect(() => {
    if (!localUser) return // ainda a carregar sessão local
    if (!isAdmin) { navigate('/menu'); return }
    loadAll()
    loadMarkup()
    loadNotifications()
  }, [localUser])

  const loadAll = async () => {
    show('A carregar painel...')
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminUsers(),
      ])
      setStats(statsRes.stats)
      setUsers(usersRes.users)
      complete('Pronto!')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao carregar dados')
      hide()
    } finally {
      setIsLoading(false)
    }
  }

  const loadMarkup = async () => {
    setMarkupLoading(true)
    setMarkupError(null)
    setMarkupTokenExpired(false)
    try {
      const data = filterMode === 'mes'
        ? await api.getMarkupStatistics({ month: selMonth, year: selYear })
        : await api.getMarkupStatistics({ dateFrom, dateTo })
      setMarkup(data)
    } catch (err) {
      if (err instanceof DerivTokenExpiredError) {
        setMarkupTokenExpired(true)
        setMarkupError(err.message)
      } else {
        setMarkupError(err instanceof Error ? err.message : 'Falha ao carregar relatório de comissão')
      }
      setMarkup(null)
    } finally {
      setMarkupLoading(false)
    }
  }

  const loadNotifications = async () => {
    setNotifLoading(true)
    try {
      const res = await api.getAdminNotifications()
      setNotifList([...res.notifications].sort((a, b) => b.createdAt - a.createdAt))
    } catch (err) {
      // não bloqueia o resto do painel — só mostra o erro dentro do próprio card
      setNotifError(err instanceof Error ? err.message : 'Falha ao carregar notificações')
    } finally {
      setNotifLoading(false)
    }
  }

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notifTitle.trim() || !notifMessage.trim()) return
    setNotifSending(true)
    setNotifError(null)
    try {
      await api.createNotification({ title: notifTitle.trim(), message: notifMessage.trim() })
      setNotifTitle('')
      setNotifMessage('')
      await loadNotifications()
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : 'Falha ao criar notificação')
    } finally {
      setNotifSending(false)
    }
  }

  const handleDeleteNotification = async (id: string) => {
    setNotifDeletingId(id)
    try {
      await api.deleteNotification(id)
      setNotifList((prev) => prev.filter((n) => n.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao apagar notificação')
    } finally {
      setNotifDeletingId(null)
    }
  }

  const handleToggleStatus = async (user: AdminUserRow) => {
    const nextStatus = user.status === 'active' ? 'blocked' : 'active'
    setBusyId(user.id)
    try {
      const { user: updated } = await api.setUserStatus(user.id, nextStatus)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      if (selectedUser?.id === updated.id) setSelectedUser(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao atualizar utilizador')
    } finally {
      setBusyId(null)
    }
  }

  const ONLINE_THRESHOLD_MS = 5 * 60 * 1000
  const now = Date.now()
  const startOfDay = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])

  const filteredUsers = useMemo(() => {
    switch (tab) {
      case 'nao_verificados':
        return users.filter((u) => !u.emailVerified)
      case 'bloqueados':
        return users.filter((u) => u.status === 'blocked')
      case 'online':
        return users.filter((u) => u.lastActiveAt !== null && now - u.lastActiveAt <= ONLINE_THRESHOLD_MS)
      case 'novos_hoje':
        return users.filter((u) => u.createdAt >= startOfDay)
      case 'inativos':
        return users.filter((u) => {
          if (u.status === 'blocked') return false
          const ref = u.lastLoginAt ?? u.createdAt
          return now - ref > 30 * 24 * 60 * 60 * 1000
        })
      default:
        return users
    }
    // Ordenados por mais recentes primeiro (registo ou atividade)
  }, [users, tab, now, startOfDay])

  const sortedUsers = useMemo(
    () => [...filteredUsers].sort((a, b) => (b.lastActiveAt ?? b.createdAt) - (a.lastActiveAt ?? a.createdAt)),
    [filteredUsers],
  )

  const goBack = () => navigate('/menu')

  if (!localUser || (isLoading && !stats)) return null
  if (!isAdmin) return null

  const TABS: { key: Tab; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'online', label: 'Online agora' },
    { key: 'novos_hoje', label: 'Novos hoje' },
    { key: 'nao_verificados', label: 'Não verificados' },
    { key: 'inativos', label: 'Inativos' },
    { key: 'bloqueados', label: 'Bloqueados' },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <div style={{ position: 'sticky', top: 0, background: 'rgba(7,11,20,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', zIndex: 10 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={goBack} className="btn-ghost" style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="logo-text" style={{ fontSize: 18 }}>PAINEL ADMIN</h1>
          <button onClick={() => { loadAll(); loadMarkup(); loadNotifications() }} title="Atualizar" style={{ marginLeft: 'auto', color: 'var(--text-faint)', padding: 8 }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v5h5" /><path d="M15 12V7h-5" />
              <path d="M13.51 5.87a6 6 0 0 0-10.16 2.14" /><path d="M2.49 10.13a6 6 0 0 0 10.16-2.14" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px 40px' }}>
        {errorMsg && (
          <div className="card" style={{ padding: 14, marginBottom: 16, border: '1px solid rgba(233,32,63,0.3)', background: 'rgba(233,32,63,0.08)' }}>
            <p style={{ color: 'var(--red-hi)', fontSize: 13 }}>{errorMsg}</p>
          </div>
        )}

        {/* Stats de utilizadores */}
        {stats && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <StatCard label="Total registados" value={stats.total} />
            <StatCard label="Online agora" value={stats.onlineNow} color="var(--green)" />
            <StatCard label="Novos hoje" value={stats.newToday} color="var(--blue-hi)" />
            <StatCard label="Não verificados" value={stats.unverified} color="#f5a623" />
            <StatCard label="Inativos (30d+)" value={stats.inactive} color="var(--text-dim)" />
            <StatCard label="Bloqueados" value={stats.blocked} color="var(--red-hi)" />
            <StatCard label="Nunca entraram" value={stats.neverLoggedIn} />
          </div>
        )}

        {/* ═══════════════ Notificações (broadcast) ═══════════════ */}
        <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', color: 'var(--text-dim)' }}><IconBellSmall /></span>
            <div>
              <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15 }}>Notificações</p>
              <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 2 }}>Enviadas para todos os utilizadores, visíveis no sino sobre o botão MENU</p>
            </div>
          </div>

          <form onSubmit={handleCreateNotification} style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              placeholder="Título"
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              maxLength={80}
              className="btn-ghost"
              style={{ padding: '10px 12px', fontSize: 13.5, width: '100%' }}
            />
            <textarea
              placeholder="Mensagem"
              value={notifMessage}
              onChange={(e) => setNotifMessage(e.target.value)}
              maxLength={400}
              rows={3}
              className="btn-ghost"
              style={{ padding: '10px 12px', fontSize: 13.5, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            />
            {notifError && <p style={{ color: 'var(--red-hi)', fontSize: 12 }}>{notifError}</p>}
            <button
              type="submit"
              disabled={notifSending || !notifTitle.trim() || !notifMessage.trim()}
              className="btn-primary"
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, alignSelf: 'flex-end', opacity: notifSending ? 0.6 : 1 }}
            >
              {notifSending ? 'A enviar…' : 'Enviar notificação'}
            </button>
          </form>

          <div>
            {notifLoading && notifList.length === 0 ? (
              <p style={{ padding: '20px 18px', color: 'var(--text-faint)', fontSize: 12.5 }}>A carregar…</p>
            ) : notifList.length === 0 ? (
              <p style={{ padding: '20px 18px', color: 'var(--text-faint)', fontSize: 12.5 }}>Nenhuma notificação enviada ainda.</p>
            ) : (
              notifList.map((n, idx) => (
                <div key={n.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px',
                  borderBottom: idx < notifList.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: 'var(--white)', fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{n.title}</p>
                    <p style={{ color: 'var(--text-dim)', fontSize: 12.5, lineHeight: 1.4, marginBottom: 4 }}>{n.message}</p>
                    <p style={{ color: 'var(--text-faint)', fontSize: 11 }}>{formatDate(n.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteNotification(n.id)}
                    disabled={notifDeletingId === n.id}
                    aria-label="Apagar notificação"
                    style={{
                      flexShrink: 0, padding: 8, borderRadius: 8, color: 'var(--red-hi)',
                      opacity: notifDeletingId === n.id ? 0.5 : 1,
                    }}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ═══════════════ Relatório de Comissão ═══════════════ */}
        <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
          {/* Cabeçalho + filtros */}
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div>
                <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15 }}>Relatório de Comissão</p>
                <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 2 }}>Markup da app na Deriv, dividido entre Kelvin e a plataforma</p>
              </div>

              {/* Alternar Mês / Intervalo */}
              <div style={{ display: 'flex', border: '1px solid var(--border-hi)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                {(['mes', 'intervalo'] as CommissionFilterMode[]).map((m) => (
                  <button key={m} onClick={() => setFilterMode(m)} style={{
                    padding: '7px 14px', fontSize: 12, fontWeight: 600,
                    background: filterMode === m ? 'var(--bg-card-hi)' : 'transparent',
                    color: filterMode === m ? 'var(--white)' : 'var(--text-faint)',
                  }}>
                    {m === 'mes' ? 'Mês' : 'Intervalo'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {filterMode === 'mes' ? (
                <>
                  <span style={{ display: 'flex', color: 'var(--text-faint)' }}><IconCalendar /></span>
                  <select value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}
                    className="btn-ghost" style={{ padding: '8px 10px', fontSize: 12.5 }}>
                    {MONTH_NAMES.map((name, i) => (
                      <option key={name} value={i + 1} style={{ background: 'var(--bg-card)' }}>{name}</option>
                    ))}
                  </select>
                  <select value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}
                    className="btn-ghost" style={{ padding: '8px 10px', fontSize: 12.5 }}>
                    {yearOptions.map((y) => (
                      <option key={y} value={y} style={{ background: 'var(--bg-card)' }}>{y}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <input type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)}
                    className="btn-ghost" style={{ padding: '7px 10px', fontSize: 12.5, colorScheme: 'dark' }} />
                  <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>até</span>
                  <input type="date" value={dateTo} min={dateFrom} max={toDateInput(new Date())} onChange={(e) => setDateTo(e.target.value)}
                    className="btn-ghost" style={{ padding: '7px 10px', fontSize: 12.5, colorScheme: 'dark' }} />
                </>
              )}
              <button onClick={loadMarkup} disabled={markupLoading} className="btn-primary"
                style={{ padding: '8px 16px', fontSize: 12, opacity: markupLoading ? 0.6 : 1 }}>
                {markupLoading ? 'A carregar…' : 'Aplicar'}
              </button>
            </div>
          </div>

          <div style={{ padding: 18 }}>
            {/* Token expirado — instrução clara em vez de erro genérico */}
            {markupTokenExpired && (
              <div style={{
                display: 'flex', gap: 12, padding: 16, borderRadius: 12,
                border: '1px solid rgba(245,166,35,0.35)', background: 'rgba(245,166,35,0.08)',
              }}>
                <span style={{ color: '#f5a623', flexShrink: 0 }}><IconAlertTriangle /></span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Token de comissão expirado</p>
                  <p style={{ color: 'var(--text-dim)', fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }}>
                    O token usado para consultar a comissão na Deriv expirou ou é inválido (validade máxima de 90 dias).
                    Gera um novo com o scope <strong style={{ color: 'var(--text)' }}>"Informações sobre o aplicativo"</strong> e
                    atualiza a variável <code style={{ background: 'var(--bg-card-hi)', padding: '1px 5px', borderRadius: 4 }}>DERIV_MARKUP_TOKEN</code> no servidor.
                  </p>
                  <a href="https://app.deriv.com/account/api-token" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#f5a623', fontSize: 12.5, fontWeight: 600 }}>
                    Gerar novo token <IconExternalLink />
                  </a>
                </div>
              </div>
            )}

            {/* Outros erros (rede, config em falta, etc.) */}
            {markupError && !markupTokenExpired && (
              <p style={{ color: 'var(--red-hi)', fontSize: 12.5 }}>{markupError}</p>
            )}

            {/* Dados */}
            {!markupError && markup && (
              <>
                <p style={{ color: 'var(--text-faint)', fontSize: 12, marginBottom: 14, textTransform: 'capitalize' }}>
                  Período: {formatPeriod(markup.date_from, markup.date_to)}
                </p>

                {/* Divisão da comissão — o destaque principal desta secção */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div className="card" style={{ flex: '1 1 200px', padding: '16px 18px', background: 'var(--bg-card-hi)' }}>
                    <p style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Comissão total ({markup.commission_split.kelvin_pct}/{markup.commission_split.platform_pct})
                    </p>
                    <p className="tabular" style={{ color: 'var(--white)', fontSize: 26, fontWeight: 700 }}>
                      {formatUsd(markup.total_app_markup_usd)}
                    </p>
                  </div>
                  <div className="card" style={{ flex: '1 1 150px', padding: '16px 18px' }}>
                    <p style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Kelvin ({markup.commission_split.kelvin_pct}%)
                    </p>
                    <p className="tabular" style={{ color: 'var(--blue-hi)', fontSize: 20, fontWeight: 700 }}>
                      {formatUsd(markup.commission_split.kelvin)}
                    </p>
                  </div>
                  <div className="card" style={{ flex: '1 1 150px', padding: '16px 18px' }}>
                    <p style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Plataforma ({markup.commission_split.platform_pct}%)
                    </p>
                    <p className="tabular" style={{ color: 'var(--green)', fontSize: 20, fontWeight: 700 }}>
                      {formatUsd(markup.commission_split.platform)}
                    </p>
                  </div>
                </div>

                {/* Métricas de apoio */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: markup.breakdown.length > 0 ? 16 : 0 }}>
                  <StatCard label="Volume negociado" value={formatUsd(markup.total_volume_usd)} />
                  <StatCard label="Payout total" value={formatUsd(markup.total_payout_usd)} />
                  <StatCard label="Contratos" value={markup.total_contract_count} />
                  <StatCard label="Clientes" value={markup.total_client_count} />
                </div>

                {markup.breakdown.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>App ID</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>Comissão</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>Volume</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>Contratos</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>Clientes</th>
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {markup.breakdown.map((b) => (
                          <tr key={b.app_id} style={{ borderBottom: '1px solid rgba(31,44,74,0.4)' }}>
                            <td style={{ padding: '8px 6px', color: 'var(--text-dim)' }}>{b.app_id}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{formatUsd(b.app_markup_usd)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-dim)' }}>{formatUsd(b.volume_usd)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-dim)' }}>{b.contract_count}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-dim)' }}>{b.client_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {!markupError && !markup && !markupLoading && (
              <p style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>Sem dados para o período selecionado.</p>
            )}
          </div>

          {/* Nota de segurança */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)',
          }}>
            <span style={{ display: 'flex', color: 'var(--text-faint)' }}><IconShield /></span>
            <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4 }}>
              Este relatório usa um token só de leitura ("Informações sobre o aplicativo") — não permite operar contas, transferir fundos ou aceder a dados pessoais de clientes.
            </p>
          </div>
        </div>

        {/* Tabs de utilizadores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ display: 'flex', color: 'var(--text-faint)' }}><IconUsers2 /></span>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, fontWeight: 600 }}>Utilizadores</p>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                border: `1px solid ${tab === t.key ? 'var(--blue)' : 'var(--border)'}`,
                background: tab === t.key ? 'rgba(24,87,255,0.12)' : 'transparent',
                color: tab === t.key ? 'var(--blue-hi)' : 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Lista de utilizadores */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {sortedUsers.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Nenhum utilizador nesta categoria.</p>
            </div>
          ) : (
            sortedUsers.map((u, idx) => {
              const isOnline = u.lastActiveAt !== null && now - u.lastActiveAt <= ONLINE_THRESHOLD_MS
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '14px 16px', background: 'transparent', border: 'none',
                    borderBottom: idx < sortedUsers.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: isOnline ? 'var(--green)' : 'var(--border-hi)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <p style={{ color: 'var(--white)', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.fullName || '(sem nome)'}
                      </p>
                      {u.role === 'admin' && (
                        <span style={{ padding: '1px 7px', background: 'rgba(245,166,35,0.15)', color: '#f5a623', fontSize: 9.5, fontWeight: 700, borderRadius: 20 }}>ADMIN</span>
                      )}
                      {u.status === 'blocked' && (
                        <span style={{ padding: '1px 7px', background: 'rgba(233,32,63,0.15)', color: 'var(--red-hi)', fontSize: 9.5, fontWeight: 700, borderRadius: 20 }}>BLOQUEADO</span>
                      )}
                      {!u.emailVerified && (
                        <span style={{ padding: '1px 7px', background: 'rgba(245,166,35,0.1)', color: '#f5a623', fontSize: 9.5, fontWeight: 700, borderRadius: 20 }}>NÃO VERIFICADO</span>
                      )}
                    </div>
                    <p style={{ color: 'var(--text-faint)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.email} · {u.whatsapp}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ color: 'var(--text-faint)', fontSize: 11 }}>Registado</p>
                    <p style={{ color: 'var(--text-dim)', fontSize: 11.5 }}>{formatDate(u.createdAt)}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Modal de detalhes / ações do utilizador */}
      {selectedUser && (
        <>
          <div onClick={() => setSelectedUser(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 640 }} />
          <div style={{ position: 'fixed', inset: '16px 16px auto', top: 16, zIndex: 650, maxWidth: 460, margin: '0 auto' }}>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <p style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15 }}>Detalhes do utilizador</p>
                <button onClick={() => setSelectedUser(null)} className="btn-ghost" style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['Nome', selectedUser.fullName || '—'],
                  ['Email', selectedUser.email],
                  ['WhatsApp', selectedUser.whatsapp || '—'],
                  ['Role', selectedUser.role === 'admin' ? 'Administrador' : 'Utilizador'],
                  ['Estado', selectedUser.status === 'active' ? 'Ativo' : 'Bloqueado'],
                  ['Email verificado', selectedUser.emailVerified ? 'Sim' : 'Não'],
                  ['Registado em', formatDate(selectedUser.createdAt)],
                  ['Último login', formatDate(selectedUser.lastLoginAt)],
                  ['Última atividade', formatDate(selectedUser.lastActiveAt)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>{label}</span>
                    <span style={{ color: 'var(--white)', fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                <button onClick={() => setSelectedUser(null)} className="btn-ghost" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 500 }}>
                  Fechar
                </button>
                <button
                  onClick={() => handleToggleStatus(selectedUser)}
                  disabled={busyId === selectedUser.id || selectedUser.role === 'admin'}
                  title={selectedUser.role === 'admin' ? 'Não é possível bloquear um administrador' : undefined}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600, borderRadius: 10, border: 'none',
                    cursor: selectedUser.role === 'admin' ? 'not-allowed' : 'pointer',
                    opacity: selectedUser.role === 'admin' ? 0.4 : 1,
                    background: selectedUser.status === 'active' ? 'rgba(233,32,63,0.15)' : 'rgba(24,201,122,0.15)',
                    color: selectedUser.status === 'active' ? 'var(--red-hi)' : 'var(--green)',
                  }}
                >
                  {busyId === selectedUser.id
                    ? 'A atualizar...'
                    : selectedUser.status === 'active' ? 'Bloquear utilizador' : 'Reativar utilizador'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
