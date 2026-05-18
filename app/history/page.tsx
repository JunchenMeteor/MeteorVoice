'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface HistoryEntry {
  id: string
  scenario: string
  accent: string
  date: string
  turns: number
  corrections: number
  status: string
}

const STORAGE_KEY = 'meteorvoice-history'

export default function HistoryPage() {
  const [sessions, setSessions] = useState<HistoryEntry[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSessions(JSON.parse(raw) as HistoryEntry[])
    } catch {}
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">Learning History</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          Review past practice sessions. History is stored locally until Supabase sync is configured.
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">📝</p>
          <p className="text-lg font-medium text-[var(--theme-text-primary)]">No sessions yet</p>
          <p className="text-sm text-[var(--theme-text-muted)] mt-2">Start a practice session from the Home page.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <Card key={s.id}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-[var(--theme-text-primary)]">{s.scenario}</h4>
                    <p className="text-xs text-[var(--theme-text-muted)]">
                      {s.date} · {s.turns} turns · {s.corrections} corrections · {s.accent}
                    </p>
                  </div>
                  <span className="status-badge success">{s.status}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
