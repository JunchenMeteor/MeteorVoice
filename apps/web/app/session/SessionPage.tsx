'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
import { VoiceWaveform, type VoiceWaveformMode } from './VoiceWaveform'

type SidePanelTab = 'corrections' | 'transcript'

function toWaveformMode(input: {
  state: string
  isSessionActive: boolean
  isRoutePaused: boolean
}): VoiceWaveformMode {
  if (input.isRoutePaused) return 'paused'
  if (!input.isSessionActive && input.state === 'session_ended') return 'ended'
  if (!input.isSessionActive) return 'idle'
  if (input.state === 'correcting') return 'speaking'
  if (
    input.state === 'listening' ||
    input.state === 'transcribing' ||
    input.state === 'thinking' ||
    input.state === 'speaking' ||
    input.state === 'idle'
  ) {
    return input.state
  }
  return 'idle'
}

export function SessionPageClient() {
  const params = useSearchParams()
  const { locale } = useLocale()
  const tr = useT()
  const scenarioKey = params.get('scenario') ?? 'small-talk'
  const accentKey = params.get('accent') ?? 'american'
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<SidePanelTab>('corrections')
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
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
    voiceLevel,
    playbackBlocked,
    configureSession,
    startSession,
    endSession,
    continueSpeaking,
    playBlockedReply,
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
  const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')
  const latestAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant')
  const waveformMode = toWaveformMode({
    state: snapshot.state,
    isSessionActive,
    isRoutePaused,
  })
  const tabButtonClass = (tab: SidePanelTab) =>
    `flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      activeTab === tab
        ? 'bg-[var(--theme-accent)] text-white'
        : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-primary)]'
    }`
  const correctionSummary = corrections.length === 0
    ? tr('session.corrections_empty')
    : tr('session.corrections_count').replace('{count}', String(corrections.length))
  const transcriptSummary = messages.length === 0
    ? tr('session.transcript_empty')
    : tr('session.transcript_count').replace('{count}', String(messages.length))

  function openMobilePanel(tab: SidePanelTab) {
    setActiveTab(tab)
    setMobilePanelOpen(true)
  }

  function renderLearningContent() {
    if (activeTab === 'corrections') {
      return corrections.length === 0 ? (
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
      ))
    }

    return messages.length === 0 ? (
      <div className="rounded-lg border border-dashed p-4 text-xs text-[var(--theme-text-muted)]" style={{ borderColor: 'var(--theme-border)' }}>
        {tr('session.transcript_empty')}
      </div>
    ) : (
      <>
        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}`}
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-surface)' }}
          >
            <p className="mb-2 text-xs font-medium text-[var(--theme-text-muted)]">
              {msg.role === 'user' ? tr('session.you') : tr('session.coach')}
            </p>
            <p className="text-sm leading-relaxed text-[var(--theme-text-primary)]">{msg.content}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </>
    )
  }

  function renderPanelTabs() {
    return (
      <div className="mb-3 flex rounded-lg border p-1" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
        <button
          type="button"
          className={tabButtonClass('corrections')}
          onClick={() => setActiveTab('corrections')}
        >
          {tr('session.corrections_tab')}
        </button>
        <button
          type="button"
          className={tabButtonClass('transcript')}
          onClick={() => setActiveTab('transcript')}
        >
          {tr('session.transcript_tab')}
        </button>
      </div>
    )
  }

  return (
    <>
      {accentBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium text-white shadow-lg"
          style={{ background: 'var(--theme-accent)' }}>
          {accentBanner}
        </div>
      )}

      <div className="lg:hidden relative flex min-h-[100dvh] flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        <div className="pointer-events-none absolute inset-0" style={{
          background: 'radial-gradient(circle at 50% 34%, color-mix(in srgb, var(--theme-accent) 14%, transparent), transparent 38%)',
          willChange: 'transform',
        }} />

        <header className="relative z-10 min-h-10 pr-14">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--theme-text-primary)]">
              {scenario.icon} {scenarioLabel}
            </p>
            <p className="mt-1 truncate text-xs text-[var(--theme-text-muted)]">
              {accentLabel} ({accentRegion}) · {difficultyLabel}
            </p>
          </div>
        </header>

        <div className="relative z-10 mt-3 flex items-center gap-2 pr-14">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: statusColor }} />
          <span className="min-w-0 truncate text-xs text-[var(--theme-text-secondary)]">{statusText}</span>
          {interrupted && (
            <span className="status-badge warning text-xs">{tr('session.interrupted')}</span>
          )}
        </div>

        <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-4xl font-semibold"
            style={{
              background: 'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
              color: 'var(--theme-accent)',
            }}
            aria-hidden="true"
          >
            M
          </div>

          <VoiceWaveform mode={waveformMode} label={statusText} level={voiceLevel ?? undefined} variant="stage" />

          <div className="w-full max-w-[22rem] space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-[var(--theme-text-muted)]">{tr('session.coach')}</p>
              <p className="mx-auto max-h-28 overflow-y-auto text-xl font-medium leading-snug text-[var(--theme-text-primary)] quiet-scrollbar">
                {latestAssistantMessage?.content ?? tr('session.subtitle_waiting_coach')}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-[var(--theme-text-muted)]">{tr('session.you')}</p>
              <p className="mx-auto max-h-20 overflow-y-auto text-sm leading-relaxed text-[var(--theme-text-secondary)] quiet-scrollbar">
                {latestUserMessage?.content ?? tr('session.subtitle_waiting_user')}
              </p>
            </div>
          </div>

          {messages.length === 0 && !isSessionActive && (
            <p className="max-w-sm text-sm leading-relaxed text-[var(--theme-text-muted)]">
              {scenarioDescription}
            </p>
          )}
        </main>

        {summary && (
          <div className="relative z-10 mb-3 max-h-24 overflow-y-auto rounded-lg p-3 text-sm text-[var(--theme-text-secondary)] quiet-scrollbar" style={{ background: 'var(--theme-surface)' }}>
            <p className="mb-1 font-semibold text-[var(--theme-accent)]">{tr('session.summary_title')}</p>
            <p className="whitespace-pre-wrap">{summary}</p>
          </div>
        )}

        <footer className="relative z-10 space-y-3">
          {playbackBlocked && (
            <div className="flex justify-center">
              <Button size="lg" onClick={playBlockedReply}>
                {tr('session.play_reply')}
              </Button>
            </div>
          )}

          {!isSessionActive ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={startSession}
                disabled={!ttsPreferenceLoaded}
                className="flex h-16 w-16 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'var(--theme-accent)' }}
                aria-label={tr('session.start')}
              >
                <svg width="30" height="30" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M7 4.5v11l8-5.5-8-5.5z" fill="#fff" />
                </svg>
              </button>
              <span className="text-sm font-medium text-[var(--theme-text-primary)]">
                {ttsPreferenceLoaded ? tr('session.start') : tr('login.loading')}
              </span>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={endSession}
                className="flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95"
                style={{ background: 'var(--theme-danger)' }}
                aria-label={tr('session.end')}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="5" y="5" width="10" height="10" rx="2" fill="#fff" />
                </svg>
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openMobilePanel('corrections')}
              className="rounded-lg border px-3 py-3 text-left"
              style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}
            >
              <span className="block text-sm font-semibold text-[var(--theme-text-primary)]">{tr('session.corrections_tab')}</span>
              <span className="mt-1 block text-xs text-[var(--theme-text-muted)]">{correctionSummary}</span>
            </button>
            <button
              type="button"
              onClick={() => openMobilePanel('transcript')}
              className="rounded-lg border px-3 py-3 text-left"
              style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}
            >
              <span className="block text-sm font-semibold text-[var(--theme-text-primary)]">{tr('session.transcript_tab')}</span>
              <span className="mt-1 block text-xs text-[var(--theme-text-muted)]">{transcriptSummary}</span>
            </button>
          </div>
        </footer>

        {mobilePanelOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 bg-[var(--theme-overlay)]"
              onClick={() => setMobilePanelOpen(false)}
              aria-label={tr('session.close_panel')}
            />
            <section
              className="fixed inset-x-0 bottom-0 z-40 flex max-h-[78dvh] min-h-[45dvh] flex-col rounded-t-2xl border-t p-4 shadow-2xl"
              style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}
            >
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-[var(--theme-border)]" />
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--theme-text-primary)]">
                    {activeTab === 'corrections' ? tr('session.correction_tips') : tr('session.transcript')}
                  </h2>
                  <p className="text-xs text-[var(--theme-text-muted)]">
                    {activeTab === 'corrections' ? correctionSummary : transcriptSummary}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobilePanelOpen(false)}
                  className="rounded-full px-3 py-1 text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface)]"
                >
                  {tr('session.close_panel')}
                </button>
              </div>
              {renderPanelTabs()}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-[env(safe-area-inset-bottom)] quiet-scrollbar">
                {renderLearningContent()}
              </div>
            </section>
          </>
        )}
      </div>

      <div className="hidden h-full max-w-6xl mx-auto p-6 lg:block">
        <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
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

          <div className="relative flex-1 min-h-0 data-panel flex flex-col items-center justify-center gap-7 overflow-hidden p-8 text-center">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--theme-accent) 12%, transparent), transparent 42%)',
              }}
            />
            {messages.length === 0 && !isSessionActive && (
              <div className="relative z-10 text-[var(--theme-text-muted)]">
                <div
                  className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full text-5xl"
                  style={{
                    background: 'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                  }}
                >
                  {scenario.icon}
                </div>
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

            {(messages.length > 0 || isSessionActive) && (
              <>
                <div
                  className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full text-5xl font-semibold"
                  style={{
                    background: 'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                    color: 'var(--theme-accent)',
                  }}
                  aria-hidden="true"
                >
                  M
                </div>

                <div className="relative z-10">
                  <VoiceWaveform mode={waveformMode} label={statusText} level={voiceLevel ?? undefined} variant="stage" />
                </div>

                <div className="relative z-10 w-full max-w-4xl space-y-5 text-center">
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('transcript')}
                      className="text-xs font-medium text-[var(--theme-accent)] hover:underline"
                    >
                      {tr('session.view_transcript')}
                    </button>
                  </div>

                  <div className="grid gap-8 md:grid-cols-2">
                    <div className="min-h-[6rem]">
                      <p className="mb-2 text-xs font-medium uppercase text-[var(--theme-text-muted)]">{tr('session.you')}</p>
                      <p className="mx-auto max-h-28 overflow-y-auto text-xl font-medium leading-snug text-[var(--theme-text-primary)] quiet-scrollbar">
                        {latestUserMessage?.content ?? tr('session.subtitle_waiting_user')}
                      </p>
                    </div>
                    <div className="min-h-[6rem]">
                      <p className="mb-2 text-xs font-medium uppercase text-[var(--theme-text-muted)]">{tr('session.coach')}</p>
                      <p className="mx-auto max-h-28 overflow-y-auto text-xl font-medium leading-snug text-[var(--theme-text-primary)] quiet-scrollbar">
                        {latestAssistantMessage?.content ?? tr('session.subtitle_waiting_coach')}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
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
          {playbackBlocked && (
            <div className="shrink-0 flex justify-center py-4">
              <Button size="lg" onClick={playBlockedReply}>
                {tr('session.play_reply')}
              </Button>
            </div>
          )}
        </section>

        <aside className="data-panel flex min-h-[18rem] flex-col p-4 lg:min-h-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--theme-text-primary)]">
                {activeTab === 'corrections' ? tr('session.correction_tips') : tr('session.transcript')}
              </h2>
              <p className="text-xs text-[var(--theme-text-muted)]">
                {activeTab === 'corrections' ? correctionSummary : transcriptSummary}
              </p>
            </div>
          </div>

          {renderPanelTabs()}

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto quiet-scrollbar">
            {renderLearningContent()}
          </div>

          {summary && (
            <div className="mt-4 shrink-0 border-t pt-4" style={{ borderColor: 'var(--theme-border)' }}>
              <h3 className="text-sm font-semibold text-[var(--theme-accent)] mb-2">{tr('session.summary_title')}</h3>
              <p className="max-h-32 overflow-y-auto text-sm text-[var(--theme-text-secondary)] whitespace-pre-wrap quiet-scrollbar">{summary}</p>
            </div>
          )}
        </aside>
        </div>
      </div>
    </>
  )
}
