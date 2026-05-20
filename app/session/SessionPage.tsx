'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
  getAccentLabel,
  getAccentRegion,
  getDifficultyLabel,
  getScenarioDescription,
  getScenarioLabel,
} from '@/lib/scenarios'
import type { ConversationResponse } from '@/lib/providers/types'
import { useLocale, useT } from '@/components/LanguageProvider'
import { useVoiceSession } from '@/components/VoiceSessionProvider'
import { Button } from '@/components/ui/button'

export function SessionPageClient() {
  const params = useSearchParams()
  const { locale } = useLocale()
  const tr = useT()
  const scenarioKey = params.get('scenario') ?? 'small-talk'
  const accentKey = params.get('accent') ?? 'american'
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const {
    scenario,
    accent,
    snapshot,
    messages,
    statusText,
    isSessionActive,
    isRoutePaused,
    corrections,
    summary,
    interrupted,
    accentBanner,
    ttsPreferenceLoaded,
    configureSession,
    startSession,
    endSession,
    continueSpeaking,
    playCorrection,
  } = useVoiceSession()

  const scenarioLabel = getScenarioLabel(scenario, locale)
  const scenarioDescription = getScenarioDescription(scenario, locale)
  const accentLabel = getAccentLabel(accent, locale)
  const accentRegion = getAccentRegion(accent, locale)
  const difficultyLabel = getDifficultyLabel(scenario.difficulty, locale)

  useEffect(() => {
    configureSession(scenarioKey, accentKey)
  }, [accentKey, configureSession, scenarioKey])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [snapshot.messages.length])

  function correctionTypeLabel(type: ConversationResponse['corrections'][number]['type']) {
    return tr(`correction.type.${type}`)
  }

  const canContinue = isSessionActive && !isRoutePaused && snapshot.state === 'idle'
  const statusColor = isSessionActive && !isRoutePaused
    ? 'var(--theme-success)'
    : isRoutePaused
      ? 'var(--theme-warning)'
      : 'var(--theme-text-muted)'

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto h-full">
      {accentBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium text-white shadow-lg"
          style={{ background: 'var(--theme-accent)' }}>
          {accentBanner}
        </div>
      )}

      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div>
              <h1 className="text-lg font-bold text-[var(--theme-text-primary)]">
                {scenario.icon} {scenarioLabel}
              </h1>
              <p className="text-xs text-[var(--theme-text-muted)]">
                {tr('session.accent_label')}: {accentLabel} ({accentRegion}) · {difficultyLabel}
              </p>
            </div>
            {isSessionActive ? (
              <Button variant="danger" size="sm" onClick={endSession}>{tr('session.end')}</Button>
            ) : (
              <Button size="sm" onClick={startSession} disabled={!ttsPreferenceLoaded}>
                {ttsPreferenceLoaded ? tr('session.start') : tr('login.loading')}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mb-4 shrink-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: statusColor }}
            />
            <span className="text-sm text-[var(--theme-text-secondary)]">{statusText}</span>
            {interrupted && (
              <span className="status-badge warning text-xs">{tr('session.interrupted')}</span>
            )}
          </div>

          {summary && (
            <div className="shrink-0 mb-4 p-4 rounded-xl border" style={{
              background: 'var(--theme-bg-card)',
              borderColor: 'var(--theme-accent)',
            }}>
              <h3 className="text-sm font-semibold text-[var(--theme-accent)] mb-2">{tr('session.summary_title')}</h3>
              <p className="text-sm text-[var(--theme-text-secondary)] whitespace-pre-wrap">{summary}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-4 quiet-scrollbar min-h-0">
            {messages.length === 0 && !isSessionActive && (
              <div className="text-center py-20 text-[var(--theme-text-muted)]">
                <p className="text-4xl mb-4">{scenario.icon}</p>
                <p className="text-lg font-medium text-[var(--theme-text-primary)]">{scenarioLabel}</p>
                <p className="text-sm mt-2">{scenarioDescription}</p>
                <p className="text-xs mt-4">
                  {tr('session.accent_label')}: <span className="text-[var(--theme-accent)]">{accentLabel}</span>
                </p>
                <p className="text-xs mt-6 text-[var(--theme-text-muted)]">
                  {tr('session.start')}
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-3 text-sm"
                  style={{
                    background: msg.role === 'user'
                      ? 'var(--theme-accent)'
                      : 'var(--theme-bg-card)',
                    color: msg.role === 'user'
                      ? '#fff'
                      : 'var(--theme-text-primary)',
                    borderColor: msg.role === 'assistant' ? 'var(--theme-border)' : 'transparent',
                    borderWidth: msg.role === 'assistant' ? 1 : 0,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {canContinue && (
            <div className="shrink-0 flex justify-center py-4">
              <button
                type="button"
                onClick={continueSpeaking}
                className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: 'var(--theme-accent)' }}
                aria-label={tr('session.start_speaking')}
              >
                <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="7" y="2" width="6" height="10" rx="3" />
                  <path d="M4 10a6 6 0 0012 0" />
                  <line x1="10" y1="16" x2="10" y2="19" />
                  <line x1="7" y1="19" x2="13" y2="19" />
                </svg>
              </button>
            </div>
          )}
        </section>

        <aside className="data-panel flex min-h-[12rem] flex-col p-4 lg:min-h-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--theme-text-primary)]">
                {tr('session.correction_tips')}
              </h2>
              <p className="text-xs text-[var(--theme-text-muted)]">
                {corrections.length === 0
                  ? tr('session.corrections_empty')
                  : tr('session.corrections_count').replace('{count}', String(corrections.length))}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto quiet-scrollbar">
            {corrections.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-xs text-[var(--theme-text-muted)]" style={{ borderColor: 'var(--theme-border)' }}>
                {tr('session.corrections_live_hint')}
              </div>
            ) : corrections.map((c, i) => (
              <div key={`${c.type}-${i}-${c.originalText}`} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-surface)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="status-badge warning">{correctionTypeLabel(c.type)}</span>
                  <button
                    type="button"
                    onClick={() => playCorrection(c.suggestedText)}
                    className="text-xs text-[var(--theme-accent)] hover:underline"
                    title={tr('session.play_correction')}
                  >
                    {tr('session.play_correction')}
                  </button>
                </div>
                <p className="text-xs text-[var(--theme-text-secondary)]">
                  <span className="line-through text-[var(--theme-danger)]">{c.originalText}</span>
                  {' -> '}
                  <span className="text-[var(--theme-success)]">{c.suggestedText}</span>
                </p>
                <p className="text-xs leading-relaxed text-[var(--theme-text-muted)]">{c.explanation}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
