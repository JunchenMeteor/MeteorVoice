/**
 * Active session indicator bar.
 * 活跃会话指示条。
 */

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { useVoiceSession } from '@/components/VoiceSessionProvider'
import {
  useLocale,
  useT,
} from '@/components/LanguageProvider'
import {
  getAccentLabel,
  getScenarioLabel,
} from '@/lib/scenarios'

export default function ActiveSessionBar() {
  const pathname = usePathname()
  const { locale } = useLocale()
  const t = useT()
  const {
    scenario,
    accent,
    isSessionActive,
    isRoutePaused,
    statusText,
    endSession,
  } = useVoiceSession()

  if (!isSessionActive || pathname.startsWith('/session')) return null

  return (
    <div className="sticky top-0 z-30 px-3 pt-3 lg:px-6">
      <div
        className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-lg border px-3 py-2 shadow-sm"
        style={{
          background: 'var(--theme-bg-card)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--theme-text-primary)]">
            {isRoutePaused ? t('session.global_paused') : t('session.global_active')}
          </p>
          <p className="truncate text-xs text-[var(--theme-text-muted)]">
            {getScenarioLabel(scenario, locale)} · {getAccentLabel(accent, locale)} · {statusText}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/session?scenario=${scenario.key}&accent=${accent.key}`}
            className="chip-action"
          >
            {t('session.return')}
          </Link>
          <Button variant="danger" size="sm" onClick={endSession}>
            {t('session.end')}
          </Button>
        </div>
      </div>
    </div>
  )
}
