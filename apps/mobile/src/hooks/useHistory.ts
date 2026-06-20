import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import { formatApiRequestError, fetchWithTimeout, type HistorySession, type SessionTurnDto } from '@meteorvoice/api-client'

export interface HistoryDeps {
  api: {
    listHistory: () => Promise<{ sessions: HistorySession[] }>
    listSessionTurns: (id: string) => Promise<{ turns: SessionTurnDto[] }>
  }
  getAuthHeaders: () => Promise<Record<string, string>>
  handleUnauthorized: () => void
  apiBaseUrl: string
  authState: string
  activeTab: string
  historyLoading: boolean
  setHistoryLoading: Dispatch<SetStateAction<boolean>>
  setHistoryError: Dispatch<SetStateAction<string | null>>
  setHistorySessions: Dispatch<SetStateAction<HistorySession[]>>
  setSelectedHistory: Dispatch<SetStateAction<HistorySession | null>>
  setSelectedHistoryTurns: Dispatch<SetStateAction<SessionTurnDto[]>>
  historyAutoLoadRef: React.MutableRefObject<boolean>
  logVoiceMetric?: (stage: string, data?: Record<string, unknown>) => void
  tr: (key: string) => string
}

export interface HistoryReturn {
  loadHistory: () => Promise<void>
  deleteSession: (id: string) => Promise<void>
  selectHistorySession: (item: HistorySession) => Promise<void>
}

export function useHistory(deps: HistoryDeps): HistoryReturn {
  const {
    api, getAuthHeaders, handleUnauthorized, apiBaseUrl, authState, activeTab,
    historyLoading, setHistoryLoading, setHistoryError, setHistorySessions,
    setSelectedHistory, setSelectedHistoryTurns, historyAutoLoadRef,
    logVoiceMetric, tr,
  } = deps

  const loadHistory = useCallback(async () => {
    if (historyLoading) return
    if (authState !== 'signed-in') {
      setHistoryError(tr('history.auth_required'))
      return
    }
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await api.listHistory()
      setHistorySessions(result.sessions)
      setSelectedHistory(result.sessions[0] ?? null)
      setSelectedHistoryTurns([])
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_history_list', presentation: 'inline',
      })
      setHistoryError(requestError.displayMessage)
    } finally {
      setHistoryLoading(false)
    }
  }, [api, authState, historyLoading, setHistoryLoading, setHistoryError,
    setHistorySessions, setSelectedHistory, setSelectedHistoryTurns, tr])

  // Auto-load when history tab becomes active
  useEffect(() => {
    if (activeTab !== 'history') return
    if (authState !== 'signed-in') {
      historyAutoLoadRef.current = false
      return
    }
    if (historyAutoLoadRef.current) return
    historyAutoLoadRef.current = true
    void loadHistory()
  }, [activeTab, authState, loadHistory, historyAutoLoadRef])

  const deleteSession = useCallback(async (id: string) => {
    setHistorySessions(prev => prev.map(s => s.id === id ? { ...s, status: 'deleted' as const } : s))
    try {
      const authHeaders = await getAuthHeaders()
      await fetchWithTimeout(fetch, `${apiBaseUrl.trim()}/api/session?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders as Record<string, string>,
      }).then(res => {
        if (res.status === 401) return handleUnauthorized()
        return undefined
      })
    } catch {
      // Best-effort deletion; keep optimistic local state
    }
  }, [apiBaseUrl, getAuthHeaders, handleUnauthorized, setHistorySessions])

  const selectHistorySession = useCallback(async (item: HistorySession) => {
    setSelectedHistory(item)
    setSelectedHistoryTurns([])
    try {
      const result = await api.listSessionTurns(item.id)
      setSelectedHistoryTurns(result.turns)
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_history_turns', presentation: 'inline',
      })
      setHistoryError(requestError.displayMessage)
    }
  }, [api, setSelectedHistory, setSelectedHistoryTurns, setHistoryError])

  return { loadHistory, deleteSession, selectHistorySession }
}
