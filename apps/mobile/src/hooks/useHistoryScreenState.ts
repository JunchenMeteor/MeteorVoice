/**
 * History screen state and data operations.
 * 历史页面状态与数据操作。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type {
  HistorySession,
  MeteorVoiceApiClient,
  SessionTurnDto,
} from '@meteorvoice/api-client'
import {
  getHistoryLoadRequestKey,
  type HistoryAuthState,
} from '../historyRefresh'

import {
  formatApiRequestError,
  MeteorVoiceApiError,
} from '@meteorvoice/api-client'

interface UseHistoryScreenStateInput {
  api: MeteorVoiceApiClient
  authState: HistoryAuthState
  authUserId: string | null
  handleUnauthorized: () => void
  refreshKey: number
}

export function useHistoryScreenState({
  api,
  authState,
  authUserId,
  handleUnauthorized,
  refreshKey,
}: UseHistoryScreenStateInput) {
  const [expandedId, setExpandedId] = useState<string | number | null>(null)
  const [filterScenario, setFilterScenario] = useState<string | null>(null)
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedHistory, setSelectedHistory] = useState<HistorySession | null>(null)
  const [selectedTurns, setSelectedTurns] = useState<SessionTurnDto[]>([])
  const lastLoadKeyRef = useRef<string | null>(null)
  const loadingRef = useRef(false)

  const loadHistory = useCallback(async () => {
    if (loadingRef.current || authState !== 'signed-in' || !authUserId) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const result = await api.listHistory()
      setSessions(result.sessions)
      setLoadedUserId(authUserId)
      setSelectedHistory(result.sessions[0] ?? null)
      setSelectedTurns([])
    } catch (error) {
      if (error instanceof MeteorVoiceApiError && error.status === 401) handleUnauthorized()
      const requestError = formatApiRequestError(error, { context: 'mobile_history_list', presentation: 'inline' })
      setError(requestError.displayMessage)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [api, authState, authUserId, handleUnauthorized])

  useEffect(() => {
    const loadKey = getHistoryLoadRequestKey(authState, authUserId, refreshKey)
    if (!loadKey) {
      lastLoadKeyRef.current = null
      return
    }
    if (lastLoadKeyRef.current === loadKey) return
    lastLoadKeyRef.current = loadKey
    void loadHistory()
  }, [authState, authUserId, loadHistory, refreshKey])

  const deleteSession = useCallback(async (id: string) => {
    setSessions(prev => prev.map(session => session.id === id ? { ...session, status: 'deleted' as const } : session))
    try {
      await api.deleteSession(id)
    } catch (error) {
      if (error instanceof MeteorVoiceApiError && error.status === 401) {
        handleUnauthorized()
      }
    }
  }, [api, handleUnauthorized])

  const selectHistory = useCallback(async (item: HistorySession) => {
    setSelectedHistory(item)
    setSelectedTurns([])
    try {
      const result = await api.listSessionTurns(item.id)
      setSelectedTurns(result.turns)
    } catch (error) {
      const requestError = formatApiRequestError(error, { context: 'mobile_history_turns', presentation: 'inline' })
      setError(requestError.displayMessage)
    }
  }, [api])

  const visibleSessions = useMemo(
    () => authUserId && loadedUserId === authUserId ? sessions : [],
    [authUserId, loadedUserId, sessions],
  )

  const toggle = useCallback((id: string | number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    const nextSession = visibleSessions.find(session => session.id === id)
    if (!nextSession) return
    setExpandedId(id)
    void selectHistory(nextSession)
  }, [expandedId, selectHistory, visibleSessions])

  const filtered = useMemo(() => (
    filterScenario
      ? visibleSessions.filter(session => session.scenario_key === filterScenario || session.scenario === filterScenario)
      : visibleSessions
  ), [filterScenario, visibleSessions])

  return {
    deleteSession,
    error,
    expandedId,
    filtered,
    filterScenario,
    hasSessions: visibleSessions.length > 0,
    loadHistory,
    loading,
    selectedHistory,
    selectedTurns,
    setFilterScenario,
    toggle,
  }
}
