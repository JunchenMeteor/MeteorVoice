'use client'

import { useEffect, useState } from 'react'
import { useLocale, useT } from '@/components/LanguageProvider'
import { Card, CardContent } from '@/components/ui/card'
import { findAccentByKeyOrName, findScenarioByKeyOrName, getAccentLabel, getScenarioLabel } from '@/lib/scenarios'

interface HistoryEntry {
  id: string
  scenario: string
  scenarioKey?: string
  accent: string
  accentKey?: string
  date: string
  status: string
  summary: string | null
}

function loadLocalHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem('meteorvoice-history')
    return raw ? JSON.parse(raw) as HistoryEntry[] : []
  } catch {
    return []
  }
}

export default function HistoryPage() {
  const { locale } = useLocale()
  const t = useT()
  const [sessions, setSessions] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'supabase' | 'local' | 'none'>('none')

  function statusLabel(status: string) {
    const key = `history.status.${status}`
    const label = t(key)
    return label === key ? status : label
  }

  function scenarioLabel(entry: HistoryEntry) {
    const scenario = findScenarioByKeyOrName(entry.scenarioKey ?? entry.scenario)
    return scenario ? getScenarioLabel(scenario, locale) : entry.scenario
  }

  function accentLabel(entry: HistoryEntry) {
    const accent = findAccentByKeyOrName(entry.accentKey ?? entry.accent)
    return accent ? getAccentLabel(accent, locale) : entry.accent
  }

  useEffect(() => {
    // Try Supabase first
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
        if (data.sessions && data.sessions.length > 0) {
          setSessions(data.sessions)
          setSource('supabase')
        } else {
          // Fallback to localStorage
          const localSessions = loadLocalHistory()
          if (localSessions.length > 0) {
            setSessions(localSessions)
            setSource('local')
          }
        }
      })
      .catch(() => {
        const localSessions = loadLocalHistory()
        if (localSessions.length > 0) {
          setSessions(localSessions)
          setSource('local')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">{t('history.title')}</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          {source === 'local'
            ? t('history.local_subtitle')
            : t('history.subtitle')
          }
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--theme-text-muted)]">{t('login.loading')}</p>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">📝</p>
          <p className="text-lg font-medium text-[var(--theme-text-primary)]">{t('history.empty')}</p>
          <p className="text-sm text-[var(--theme-text-muted)] mt-2">{t('history.empty_hint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <Card key={s.id}>
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-[var(--theme-text-primary)]">{scenarioLabel(s)}</h4>
                    <p className="text-xs text-[var(--theme-text-muted)]">
                      {s.date} · {accentLabel(s)}
                    </p>
                    {s.summary && (
                      <p className="text-xs text-[var(--theme-text-secondary)] mt-2 line-clamp-2">{s.summary}</p>
                    )}
                  </div>
                  <span className="status-badge success shrink-0">{statusLabel(s.status)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
