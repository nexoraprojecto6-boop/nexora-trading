// ============================================================
// NEXORA FOREX — useNotifications
// Faz polling das notificações (broadcast, criadas no painel admin)
// e controla o estado de "não lida" via localStorage — não depende
// de um endpoint de "marcar como lida" por utilizador no backend.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { FEATURES } from '../lib/config'
import type { AdminNotification } from '../lib/types'

const SEEN_KEY = 'nexora_last_seen_notification_at'
const POLL_MS  = 60_000 // 1 min

export function useNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [hasUnread, setHasUnread]         = useState(false)

  const load = useCallback(async () => {
    // Sem servidor de avisos (FEATURES.notifications desligada) não há pedidos de 1 em 1 minuto.
    if (!FEATURES.notifications) return
    try {
      const res = await api.getNotifications()
      const list = [...res.notifications].sort((a, b) => b.createdAt - a.createdAt)
      setNotifications(list)
      let lastSeen = 0
      try { lastSeen = Number(localStorage.getItem(SEEN_KEY) || 0) } catch { /* sem armazenamento */ }
      const newest = list[0]?.createdAt ?? 0
      setHasUnread(newest > lastSeen)
    } catch {
      // silencioso — notificações não podem travar o dashboard
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  // Chamado quando o utilizador abre o modal — apaga o sino vermelho
  const markAllRead = useCallback(() => {
    const newest = notifications[0]?.createdAt ?? Date.now()
    try { localStorage.setItem(SEEN_KEY, String(newest)) } catch { /* sem armazenamento */ }
    setHasUnread(false)
  }, [notifications])

  return { notifications, hasUnread, markAllRead, reload: load }
}
