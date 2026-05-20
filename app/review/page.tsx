'use client'

import { useState } from 'react'
import { useLocale, useT } from '@/components/LanguageProvider'
import { Card, CardContent } from '@/components/ui/card'
import type { ConversationResponse } from '@/lib/providers/types'
import { findScenarioByKeyOrName, getScenarioLabel } from '@/lib/scenarios'

interface ReviewItem {
  id: string
  type: string
  original: string
  suggested: string
  explanation: string
  scenario: string
  scenarioKey?: string
  date: string
}

type Translate = (key: string) => string

function sampleReviewItems(session: Pick<ReviewItem, 'scenario' | 'scenarioKey' | 'date'>, index: number, t: Translate): ReviewItem[] {
  return [
    {
      id: `${session.date}-${index}-a`,
      type: 'grammar',
      original: t('review.sample.grammar.original'),
      suggested: t('review.sample.grammar.suggested'),
      explanation: t('review.sample.grammar.explanation'),
      scenario: session.scenario,
      scenarioKey: session.scenarioKey,
      date: session.date,
    },
    {
      id: `${session.date}-${index}-b`,
      type: 'vocabulary',
      original: t('review.sample.vocabulary.original'),
      suggested: t('review.sample.vocabulary.suggested'),
      explanation: t('review.sample.vocabulary.explanation'),
      scenario: session.scenario,
      scenarioKey: session.scenarioKey,
      date: session.date,
    },
    {
      id: `${session.date}-${index}-c`,
      type: 'pronunciation',
      original: t('review.sample.pronunciation.original'),
      suggested: t('review.sample.pronunciation.suggested'),
      explanation: t('review.sample.pronunciation.explanation'),
      scenario: session.scenario,
      scenarioKey: session.scenarioKey,
      date: session.date,
    },
  ]
}

function loadReviewItems(t: Translate): ReviewItem[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem('meteorvoice-history')
    if (!raw) return []

    const sessions = JSON.parse(raw) as {
      scenario: string
      scenarioKey?: string
      date: string
      corrections: number
      correctionItems?: ConversationResponse['corrections']
    }[]
    const reviewItems: ReviewItem[] = []
    sessions.forEach(s => {
      if (s.correctionItems?.length) {
        s.correctionItems.forEach((correction, i) => {
          reviewItems.push({
            id: `${s.date}-${i}-${correction.type}`,
            type: correction.type,
            original: correction.originalText,
            suggested: correction.suggestedText,
            explanation: correction.explanation,
            scenario: s.scenario,
            scenarioKey: s.scenarioKey,
            date: s.date,
          })
        })
        return
      }

      const count = s.corrections ?? Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) {
        const templates = sampleReviewItems(s, i, t)
        reviewItems.push(templates[i % 3])
      }
    })
    return reviewItems
  } catch {
    return []
  }
}

export default function ReviewPage() {
  const { locale } = useLocale()
  const t = useT()
  const [items] = useState<ReviewItem[]>(() => loadReviewItems(t))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  function correctionTypeLabel(type: string) {
    return t(`correction.type.${type}`)
  }

  function scenarioLabel(item: ReviewItem) {
    const scenario = findScenarioByKeyOrName(item.scenarioKey ?? item.scenario)
    return scenario ? getScenarioLabel(scenario, locale) : item.scenario
  }

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
          {currentIndex + 1} / {items.length} · {scenarioLabel(current)} · {current.date}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="text-center">
            <span className="status-badge warning text-sm mb-3">{correctionTypeLabel(current.type)}</span>
            <div className="mt-4 p-6 rounded-xl border-2" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-surface)' }}>
              <p className="text-sm text-[var(--theme-text-muted)] mb-1">{t('review.original')}</p>
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
                {t('review.reveal')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-6 rounded-xl border-2" style={{ borderColor: 'var(--theme-success)', background: 'var(--theme-surface)' }}>
                <p className="text-sm text-[var(--theme-text-muted)] mb-1">{t('review.corrected')}</p>
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
              {t('review.previous')}
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
              {t('review.next')}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
