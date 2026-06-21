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
  formatApiRequestError,
  MeteorVoiceApiError,
} from '@meteorvoice/api-client'

interface UseHistoryScreenStateInput {
  api: MeteorVoiceApiClient
  handleUnauthorized: () => void
}

export function useHistoryScreenState({
  api,
  handleUnauthorized,
}: UseHistoryScreenStateInput) {
  const [expandedId, setExpandedId] = useState<string | number | null>(null)
  const [filterScenario, setFilterScenario] = useState<string | null>(null)
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedHistory, setSelectedHistory] = useState<HistorySession | null>(null)
  const [selectedTurns, setSelectedTurns] = useState<SessionTurnDto[]>([])
  const autoLoadRef = useRef(false)

  const loadHistory = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.listHistory()
      setSessions(result.sessions)
      setSelectedHistory(result.sessions[0] ?? null)
      setSelectedTurns([])
    } catch (error) {
      const requestError = formatApiRequestError(error, { context: 'mobile_history_list', presentation: 'inline' })
      setError(requestError.displayMessage)
    } finally {
      setLoading(false)
    }
  }, [api, loading])

  useEffect(() => {
    if (autoLoadRef.current) return
    autoLoadRef.current = true
    void loadHistory()
  }, [loadHistory])

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

  const toggle = useCallback((id: string | number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    const nextSession = sessions.find(session => session.id === id)
    if (!nextSession) return
    setExpandedId(id)
    void selectHistory(nextSession)
  }, [expandedId, selectHistory, sessions])

  const filtered = useMemo(() => (
    filterScenario
      ? sessions.filter(session => session.scenario_key === filterScenario || session.scenario === filterScenario)
      : sessions
  ), [filterScenario, sessions])

  return {
    deleteSession,
    error,
    expandedId,
    filtered,
    filterScenario,
    loadHistory,
    loading,
    selectedHistory,
    selectedTurns,
    setFilterScenario,
    toggle,
  }
}
