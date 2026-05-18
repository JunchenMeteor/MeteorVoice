'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/LanguageProvider'
import { Card, CardContent } from '@/components/ui/card'

interface ReviewItem {
  id: string
  type: string
  original: string
  suggested: string
  explanation: string
  scenario: string
  date: string
}

export default function ReviewPage() {
  const t = useT()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    // Build review list from localStorage history
    const raw = localStorage.getItem('meteorvoice-history')
    if (!raw) return
    const sessions = JSON.parse(raw) as { scenario: string; date: string; corrections: number }[]
    // Generate mock review items from sessions with corrections
    const reviewItems: ReviewItem[] = []
    sessions.forEach(s => {
      const count = s.corrections ?? Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) {
        const items: ReviewItem[] = [
          { id: `${s.date}-${i}-a`, type: 'grammar', original: 'I goes to school', suggested: 'I go to school', explanation: 'Third-person "s" only applies to he/she/it.', scenario: s.scenario, date: s.date },
          { id: `${s.date}-${i}-b`, type: 'vocabulary', original: 'I want to order', suggested: 'I would like to order', explanation: '"Would like" is more polite in service situations.', scenario: s.scenario, date: s.date },
          { id: `${s.date}-${i}-c`, type: 'pronunciation', original: 'com-fort-a-ble', suggested: 'comf-ta-ble', explanation: 'Native speakers drop the middle syllable.', scenario: s.scenario, date: s.date },
        ]
        reviewItems.push(items[i % 3])
      }
    })
    setItems(reviewItems)
  }, [])

  if (items.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)] mb-1">{t('review.title')}</h1>
        <div className="text-center py-20">
          <p className="text-4xl mb-4">📚</p>
          <p className="text-lg font-medium text-[var(--theme-text-primary)]">{t('review.empty')}</p>
          <p className="text-sm text-[var(--theme-text-muted)] mt-2">{t('review.empty_hint')}</p>
        </div>
      </div>
    )
  }

  const current = items[currentIndex]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)] mb-1">{t('review.title')}</h1>
        <p className="text-sm text-[var(--theme-text-secondary)]">
          {currentIndex + 1} / {items.length} · {current.scenario} · {current.date}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="text-center">
            <span className="status-badge warning text-sm mb-3">{current.type}</span>
            <div className="mt-4 p-6 rounded-xl border-2" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-surface)' }}>
              <p className="text-sm text-[var(--theme-text-muted)] mb-1">Original</p>
              <p className="text-xl font-medium text-[var(--theme-danger)] line-through">{current.original}</p>
            </div>
          </div>

          {!revealed ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="px-6 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'var(--theme-accent)' }}
              >
                Reveal Correction
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-6 rounded-xl border-2" style={{ borderColor: 'var(--theme-success)', background: 'var(--theme-surface)' }}>
                <p className="text-sm text-[var(--theme-text-muted)] mb-1">Corrected</p>
                <p className="text-xl font-medium text-[var(--theme-success)]">{current.suggested}</p>
              </div>
              <p className="text-sm text-center text-[var(--theme-text-secondary)]">{current.explanation}</p>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setCurrentIndex(i => Math.max(0, i - 1))
                setRevealed(false)
              }}
              disabled={currentIndex === 0}
              className="chip-action"
              style={{ opacity: currentIndex === 0 ? 0.4 : 1 }}
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentIndex(i => Math.min(items.length - 1, i + 1))
                setRevealed(false)
              }}
              disabled={currentIndex === items.length - 1}
              className="chip-action"
              style={{ opacity: currentIndex === items.length - 1 ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
