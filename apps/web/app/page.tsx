'use client'

import { useRouter } from 'next/navigation'
import { getDifficultyLabel, getScenarioDescription, getScenarioLabel, scenarios, pickRandomAccent } from '@/lib/scenarios'
import { useLocale, useT } from '@/components/LanguageProvider'

export default function HomePage() {
  const router = useRouter()
  const { locale } = useLocale()
  const t = useT()

  function startSession(scenarioKey: string) {
    const accent = pickRandomAccent()
    router.push(`/session?scenario=${scenarioKey}&accent=${accent.key}`)
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
    </div>
  )
}
