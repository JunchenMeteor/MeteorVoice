'use client'

import { useRouter } from 'next/navigation'
import { scenarios, pickRandomAccent } from '@/lib/scenarios'

export default function HomePage() {
  const router = useRouter()

  function startSession(scenarioKey: string) {
    const accent = pickRandomAccent()
    router.push(`/session?scenario=${scenarioKey}&accent=${accent.key}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">Practice English</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          Choose a scenario to start a voice conversation with an AI coach. Accent and corrections are automatic.
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
            <h3 className="font-semibold text-[var(--theme-text-primary)]">{s.name}</h3>
            <p className="text-xs text-[var(--theme-accent)] mt-0.5">{s.nameZh}</p>
            <p className="text-sm text-[var(--theme-text-secondary)] mt-2">{s.description}</p>
            <span className="inline-block chip-action mt-3">{s.difficulty}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
