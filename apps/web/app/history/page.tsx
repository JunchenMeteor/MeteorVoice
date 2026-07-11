/**
 * Session history page (web).
 * 会话历史页面（Web 端）。
 */

'use client'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  formatApiRequestError,
  readApiJsonResponse,
} from '@meteorvoice/api-client'
import {
  displayErrorFeedback,
  hideAppFeedback,
  runAppOperationGroup,
} from '@meteorvoice/shared'

import { flushPendingPreferences } from '@/lib/tts-speed'
import {
  useLocale,
  useT,
} from '@/components/LanguageProvider'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  findAccentByKeyOrName,
  findScenarioByKeyOrName,
  getAccentLabel,
  getScenarioLabel,
  scenarios,
} from '@/lib/scenarios'

interface HistorySession {
  id: string
  scenario: string
  scenario_key?: string | null
  accent: string
  accent_key?: string | null
  date: string
  status: string
  summary: string | null
}

interface TurnData {
  id: string
  sessionId: string
  speaker: string
  transcript: string
  createdAt: string
  corrections: {
    id: string
    type: string
    originalText: string
    suggestedText: string
    explanation: string
    severity: string
  }[]
}

const PAGE_SIZE = 20
const historyFeedbackSource = 'web_history'
const historyErrorFeedbackSource = 'web_history_error'

export default function HistoryPage() {
  const { locale } = useLocale()
  const t = useT()
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'supabase' | 'local' | 'none'>('none')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterScenario, setFilterScenario] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [turns, setTurns] = useState<TurnData[]>([])
  const [turnsLoading, setTurnsLoading] = useState(false)
  const [turnsError, setTurnsError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const historyLoadingMessage = t('history.loading')

  function statusLabel(status: string) {
    const key = `history.status.${status}`
    const label = t(key)
    return label === key ? status : label
  }

  function scenarioLabel(entry: HistorySession) {
    const scenario = findScenarioByKeyOrName(entry.scenario_key ?? entry.scenario)
    return scenario ? getScenarioLabel(scenario, locale) : entry.scenario
  }

  function accentLabel(entry: HistorySession) {
    const accent = findAccentByKeyOrName(entry.accent_key ?? entry.accent)
    return accent ? getAccentLabel(accent, locale) : entry.accent
  }

  function correctionTypeLabel(type: string) {
    return t(`correction.type.${type}`)
  }

  const loadSessions = useCallback(async (offset: number, scenario?: string | null) => {
    const params = new URLSearchParams()
    params.set('offset', String(offset))
    params.set('limit', String(PAGE_SIZE))
    if (scenario) params.set('scenario', scenario)

    const res = await fetch(`/api/history?${params.toString()}`)
    return readApiJsonResponse<{ sessions: HistorySession[]; hasMore: boolean }>(res, 'History request failed')
  }, [])

  // 首次加载
  useEffect(() => {
    void flushPendingPreferences()
    async function loadInitialSessions() {
      setLoading(true)
      const results = await runAppOperationGroup({
        source: historyFeedbackSource,
        feedback: {
          message: historyLoadingMessage,
          variant: 'hud',
          blocksInteraction: true,
        },
        tasks: {
          sessions: () => loadSessions(0, filterScenario),
        },
      })
      if (results.sessions.status === 'fulfilled') {
        const data = results.sessions.value
        if (data.sessions && data.sessions.length > 0) {
          setSessions(data.sessions)
          setHasMore(data.hasMore)
          setSource('supabase')
        } else {
          setSource('none')
        }
      } else {
        const requestError = formatApiRequestError(results.sessions.reason, {
          context: 'web_history_list',
          presentation: 'inline',
        })
        setError(requestError.displayMessage)
      }
      setLoading(false)
    }
    void loadInitialSessions()
    return () => hideAppFeedback(historyFeedbackSource)
  }, [filterScenario, historyLoadingMessage, loadSessions])

  // 加载更多
  async function handleLoadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const results = await runAppOperationGroup({
      source: historyFeedbackSource,
      feedback: {
        message: historyLoadingMessage,
        variant: 'hud',
        blocksInteraction: true,
      },
      tasks: {
        sessions: () => loadSessions(sessions.length, filterScenario),
      },
    })
    if (results.sessions.status === 'fulfilled') {
      const data = results.sessions.value
      setSessions(prev => [...prev, ...(data.sessions ?? [])])
      setHasMore(data.hasMore)
    } else {
      const requestError = formatApiRequestError(results.sessions.reason, {
        context: 'web_history_load_more',
        presentation: 'banner',
      })
      displayErrorFeedback(requestError, historyErrorFeedbackSource)
    }
    setLoadingMore(false)
  }

  // 展开/收起 session turns
  async function handleToggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setTurns([])
      return
    }
    setExpandedId(id)
    setTurns([])
    setTurnsError(null)
    setTurnsLoading(true)
    const results = await runAppOperationGroup({
      source: historyFeedbackSource,
      feedback: {
        message: historyLoadingMessage,
        variant: 'hud',
        blocksInteraction: true,
      },
      tasks: {
        turns: async () => {
          const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/turns`)
          return readApiJsonResponse<{ turns: TurnData[] }>(res, 'History turns request failed')
        },
      },
    })
    if (results.turns.status === 'fulfilled') {
      setTurns(results.turns.value.turns ?? [])
    } else {
      const requestError = formatApiRequestError(results.turns.reason, {
        context: 'web_history_turns',
        presentation: 'inline',
      })
      setTurnsError(requestError.displayMessage)
    }
    setTurnsLoading(false)
  }

  // 软删除
  async function handleDelete(id: string) {
    if (!confirm(t('history.delete_confirm'))) return
    setDeletingId(id)
    const results = await runAppOperationGroup({
      source: historyFeedbackSource,
      feedback: {
        message: historyLoadingMessage,
        variant: 'hud',
        blocksInteraction: true,
      },
      tasks: {
        deleted: async () => {
          const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
          if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
          return true
        },
      },
    })
    if (results.deleted.status === 'fulfilled') {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'deleted' } : s))
    } else {
      const requestError = formatApiRequestError(results.deleted.reason, {
        context: 'web_history_delete',
        presentation: 'banner',
      })
      displayErrorFeedback(requestError, historyErrorFeedbackSource)
    }
    setDeletingId(null)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">{t('history.title')}</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          {source === 'none' && !loading ? t('history.empty') : t('history.subtitle')}
        </p>
      </div>

      {/* 场景筛选 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setFilterScenario(null); setSessions([]); setLoading(true) }}
          className={`chip-action ${filterScenario === null ? 'is-active' : ''}`}
        >
          {t('history.filter_all')}
        </button>
        {scenarios.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => { setFilterScenario(s.key); setSessions([]); setLoading(true) }}
            className={`chip-action ${filterScenario === s.key ? 'is-active' : ''}`}
          >
            {s.icon} {getScenarioLabel(s, locale)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--theme-text-muted)]">{t('history.loading')}</p>
      ) : error ? (
        <p className="text-sm text-[var(--theme-danger)]">{error}</p>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">📝</p>
          <p className="text-lg font-medium text-[var(--theme-text-primary)]">{t('history.empty')}</p>
          <p className="text-sm text-[var(--theme-text-muted)] mt-2">{t('history.empty_hint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const isExpanded = expandedId === s.id
            const isDeleted = s.status === 'deleted'
            return (
              <Card key={s.id} style={{ opacity: isDeleted ? 0.5 : 1 }}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-[var(--theme-text-primary)]">{scenarioLabel(s)}</h4>
                      <p className="text-xs text-[var(--theme-text-muted)]">
                        {s.date} · {accentLabel(s)}
                      </p>
                      {(s.summary || isExpanded) && (
                        <p className="text-xs text-[var(--theme-text-secondary)] mt-2 line-clamp-2">
                          {isExpanded ? '' : s.summary}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`status-badge ${isDeleted ? 'danger' : 'success'} text-xs`}>
                        {statusLabel(s.status)}
                      </span>
                      {!isDeleted && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(s.id)}
                          disabled={deletingId === s.id}
                          className="text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-danger)] transition-colors"
                          aria-label={`${t('history.delete')}: ${scenarioLabel(s)}`}
                          title={t('history.delete')}
                        >
                          {deletingId === s.id ? '...' : '✕'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 展开/收起 turns */}
                  <button
                    type="button"
                    onClick={() => void handleToggleExpand(s.id)}
                    className="mt-2 text-xs text-[var(--theme-accent)] hover:underline"
                  >
                    {isExpanded ? t('history.collapse_turns') : t('history.expand_turns')}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 border-t pt-3 space-y-3" style={{ borderColor: 'var(--theme-border)' }}>
                      {turnsLoading ? (
                        <p className="text-xs text-[var(--theme-text-muted)]">{t('history.loading')}</p>
                      ) : turnsError ? (
                        <p className="text-xs text-[var(--theme-text-muted)]">{turnsError}</p>
                      ) : turns.length === 0 ? (
                        <p className="text-xs text-[var(--theme-text-muted)]">{t('history.no_turns')}</p>
                      ) : (
                        <>
                          <p className="text-xs font-medium text-[var(--theme-text-muted)]">
                            {t('history.turns_count', { count: turns.length })}
                          </p>
                          {turns.map(turn => (
                            <div
                              key={turn.id}
                              className="rounded-lg border p-3"
                              style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-surface)' }}
                            >
                              <p className="mb-2 text-xs font-medium text-[var(--theme-text-muted)]">
                                {turn.speaker === 'user' ? t('session.you') : t('session.coach')}
                              </p>
                              <p className="text-sm leading-relaxed text-[var(--theme-text-primary)]">{turn.transcript}</p>
                              {turn.corrections.length > 0 && (
                                <div className="mt-2 space-y-2">
                                  {turn.corrections.map(c => (
                                    <div key={c.id} className="rounded border p-2" style={{ borderColor: 'var(--theme-border)' }}>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="status-badge warning text-xs">{correctionTypeLabel(c.type)}</span>
                                      </div>
                                      <p className="text-xs text-[var(--theme-text-secondary)]">
                                        <span className="line-through text-[var(--theme-danger)]">{c.originalText}</span>
                                        {' → '}
                                        <span className="text-[var(--theme-success)]">{c.suggestedText}</span>
                                      </p>
                                      {c.explanation && (
                                        <p className="text-xs text-[var(--theme-text-muted)] mt-1">{c.explanation}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                className="chip-action"
              >
                {loadingMore ? t('history.loading') : t('history.load_more')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
