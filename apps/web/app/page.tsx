'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { getDifficultyLabel, getScenarioDescription, getScenarioLabel, scenarios, pickRandomAccent } from '@/lib/scenarios'
import { useLocale, useT } from '@/components/LanguageProvider'
import { useVoiceSession } from '@/components/VoiceSessionProvider'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  const router = useRouter()
  const { locale } = useLocale()
  const t = useT()
  const { accent, endSession, isSessionActive, scenario: activeScenario } = useVoiceSession()
  const [pendingScenarioKey, setPendingScenarioKey] = useState<string | null>(null)

  function startSession(scenarioKey: string) {
    if (isSessionActive) {
      if (scenarioKey === activeScenario.key) {
        router.push(`/session?scenario=${activeScenario.key}&accent=${accent.key}`)
        return
      }
      setPendingScenarioKey(scenarioKey)
      return
    }

    const nextAccent = pickRandomAccent()
    router.push(`/session?scenario=${scenarioKey}&accent=${nextAccent.key}`)
  }

  function returnToSession() {
    setPendingScenarioKey(null)
    router.push(`/session?scenario=${activeScenario.key}&accent=${accent.key}`)
  }

  async function startOver() {
    const nextScenarioKey = pendingScenarioKey
    if (!nextScenarioKey) return
    setPendingScenarioKey(null)
    await endSession()
    const nextAccent = pickRandomAccent()
    router.push(`/session?scenario=${nextScenarioKey}&accent=${nextAccent.key}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">{t('home.title')}</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          {t('home.subtitle')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scenarios.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => startSession(s.key)}
            className="data-panel p-5 text-left hover:ring-2 hover:ring-[var(--theme-accent)] transition-all cursor-pointer"
          >
            <div className="text-2xl mb-3">{s.icon}</div>
            <h3 className="font-semibold text-[var(--theme-text-primary)]">{getScenarioLabel(s, locale)}</h3>
            <p className="text-sm text-[var(--theme-text-secondary)] mt-2">{getScenarioDescription(s, locale)}</p>
            <span className="inline-block chip-action mt-3">{getDifficultyLabel(s.difficulty, locale)}</span>
          </button>
        ))}
      </div>

      {pendingScenarioKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'var(--theme-overlay)' }}>
          <div className="w-full max-w-sm rounded-lg border p-4 shadow-xl" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <h2 className="text-base font-semibold text-[var(--theme-text-primary)]">{t('home.active_session_dialog_title')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--theme-text-secondary)]">
              {t('home.active_session_dialog_desc')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={returnToSession}>{t('session.return')}</Button>
              <Button variant="danger" onClick={startOver}>{t('home.start_over')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
