'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useCallback } from 'react'
import { scenarios, accentProfiles, pickRandomAccent, type AccentProfile } from '@/lib/scenarios'
import { createMockSTT } from '@/lib/providers/mock-stt'
import { createMockTTS } from '@/lib/providers/mock-tts'
import { browserSTTSupported, createBrowserSTT } from '@/lib/providers/browser-stt'
import { transition, createInitialSnapshot, type WorkflowState, type WorkflowSnapshot } from '@/lib/conversation-workflow'
import type { ConversationMessage, ConversationResponse } from '@/lib/providers/types'
import { useT } from '@/components/LanguageProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const mockSTT = createMockSTT()
const mockTTS = createMockTTS()

export function SessionPageClient() {
  const params = useSearchParams()
  const tr = useT()
  const scenarioKey = params.get('scenario') ?? 'small-talk'
  const accentKey = params.get('accent') ?? 'american'

  const scenario = scenarios.find(s => s.key === scenarioKey) ?? scenarios[0]

  const [accent, setAccent] = useState<AccentProfile>(
    accentProfiles.find(a => a.key === accentKey) ?? accentProfiles[0],
  )
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(() =>
    createInitialSnapshot(crypto.randomUUID()),
  )
  const [statusText, setStatusText] = useState(tr('session.ready'))
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [corrections, setCorrections] = useState<ConversationResponse['corrections']>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [interrupted, setInterrupted] = useState(false)
  const [accentBanner, setAccentBanner] = useState<string | null>(null)
  const [ttsProvider, setTtsProvider] = useState('mock')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages: ConversationMessage[] = snapshot.messages

  const applyTransition = useCallback((to: WorkflowState, patch: Partial<WorkflowSnapshot> = {}) => {
    setSnapshot(prev => transition(prev, to, { ...patch }))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [snapshot.messages.length])

  useEffect(() => {
    if (accentBanner) {
      const timer = setTimeout(() => setAccentBanner(null), 2500)
      return () => clearTimeout(timer)
    }
  }, [accentBanner])

  useEffect(() => {
    fetch('/api/preferences')
      .then(res => res.json())
      .then((data: { tts_provider?: string }) => {
        if (data.tts_provider) setTtsProvider(data.tts_provider)
      })
      .catch(() => {})
  }, [])

  function rotateAccent(): AccentProfile {
    const next = pickRandomAccent()
    setAccent(next)
    setAccentBanner(`${tr('session.accent_changed')} ${next.name}`)
    return next
  }

  function startSession() {
    setIsSessionActive(true)
    setSummary(null)
    simulateTurn()
  }

  async function endSession() {
    setIsSessionActive(false)
    applyTransition('session_ended')
    setStatusText(tr('session.ended'))

    // Save to localStorage history (always as fallback)
    try {
      const raw = localStorage.getItem('meteorvoice-history')
      const history = raw ? JSON.parse(raw) : []
      history.unshift({
        id: snapshot.sessionId,
        scenario: scenario.name,
        accent: accent.name,
        date: new Date().toISOString().split('T')[0],
        turns: snapshot.turnNumber,
        corrections: corrections.length + snapshot.lastCorrections.length,
        status: 'completed',
        summary: '',
      })
      localStorage.setItem('meteorvoice-history', JSON.stringify(history.slice(0, 50)))
    } catch {}

    // Sync to Supabase: create session record
    const sessionPayload = {
      session_id: snapshot.sessionId,
      scenario: scenario.name,
      accent: accent.name,
      turns: snapshot.turnNumber,
      messages: snapshot.messages.slice(-10),
      turnNumber: snapshot.turnNumber,
      corrections: [...corrections, ...snapshot.lastCorrections],
    }

    try {
      await fetch('/api/session/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload),
      })
    } catch {}

    // Generate AI summary (also saves to learning_history server-side)
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: snapshot.sessionId,
          scenario: scenario.name,
          messages: snapshot.messages.slice(-10),
          turnNumber: snapshot.turnNumber,
        }),
      })
      const data = await res.json()
      if (data.summary) setSummary(data.summary)
    } catch {}
  }

  async function simulateTurn() {
    setInterrupted(false)
    setCorrections([])
    setStatusText(tr('session.listening'))
    applyTransition('listening')

    // Try browser STT first, fall back to mock only when API unsupported
    let transcript: string
    if (browserSTTSupported()) {
      try {
        const browserSTT = createBrowserSTT()
        const result = await browserSTT.transcribe(new Blob())
        transcript = result.transcript
      } catch {
        setStatusText(tr('session.no_speech'))
        applyTransition('idle')
        return
      }
    } else {
      const result = await mockSTT.transcribe(new Blob())
      transcript = result.transcript
    }

    setStatusText(tr('session.transcribing'))
    applyTransition('transcribing', { lastTranscript: transcript })

    const userMsg: ConversationMessage = { role: 'user', content: transcript }
    setSnapshot(prev => ({ ...prev, messages: [...prev.messages, userMsg] }))

    // Rotate accent every 3 turns
    const newAccent = snapshot.turnNumber > 0 && snapshot.turnNumber % 3 === 0 ? rotateAccent() : accent

    setStatusText(tr('session.thinking'))
    applyTransition('thinking')
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...snapshot.messages, userMsg],
        context: {
          scenario: { name: scenario.name, description: scenario.description },
          accentProfile: { name: newAccent.name, region: newAccent.region },
          sessionId: snapshot.sessionId,
          turnNumber: snapshot.turnNumber + 1,
        },
      }),
    })
    const response: ConversationResponse = await res.json()
    applyTransition('thinking', { lastResponse: response.text })

    setStatusText(tr('session.speaking'))
    applyTransition('speaking')
    await speakText(response.text, newAccent.name)
    const assistantMsg: ConversationMessage = { role: 'assistant', content: response.text }
    setSnapshot(prev => ({ ...prev, messages: [...prev.messages, assistantMsg] }))

    if (response.corrections.length > 0) {
      setCorrections(response.corrections)
      applyTransition('correcting', { lastCorrections: response.corrections })
      setStatusText(tr('session.correcting'))
    } else {
      setStatusText(tr('session.tap_mic'))
      applyTransition('idle')
    }
  }

  function continueSpeaking() {
    setCorrections([])
    setStatusText(tr('session.listening'))
    simulateTurn()
  }

  async function speakText(text: string, accentName: string) {
    try {
      if (ttsProvider === 'mock') {
        await mockTTS.synthesize(text, { accent: accentName })
        return
      }
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, accent: accentName, provider: ttsProvider }),
      })
      const result = await res.json() as { audioUrl?: string }
      if (result.audioUrl) {
        const audio = new Audio(result.audioUrl)
        await audio.play()
      }
    } catch {
      await mockTTS.synthesize(text, { accent: accentName })
    }
  }

  function playCorrection(text: string) {
    speakText(text, accent.name)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col h-full">
      {/* Accent rotation banner */}
      {accentBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium text-white shadow-lg"
          style={{ background: 'var(--theme-accent)' }}>
          {accentBanner}
        </div>
      )}

      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-[var(--theme-text-primary)]">
            {scenario.icon} {scenario.name}
          </h1>
          <p className="text-xs text-[var(--theme-text-muted)]">
            Accent: {accent.name} ({accent.region}) · {scenario.difficulty}
          </p>
        </div>
        {isSessionActive ? (
          <Button variant="danger" size="sm" onClick={endSession}>{tr('session.end')}</Button>
        ) : (
          <Button size="sm" onClick={startSession}>{tr('session.start')}</Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: isSessionActive ? 'var(--theme-success)' : 'var(--theme-text-muted)' }}
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
            <p className="text-lg font-medium text-[var(--theme-text-primary)]">{scenario.nameZh}</p>
            <p className="text-sm mt-2">{scenario.description}</p>
            <p className="text-xs mt-4">
              Accent: <span className="text-[var(--theme-accent)]">{accent.name}</span>
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

      {corrections.length > 0 && (
        <div className="shrink-0 mt-4">
          <Card>
            <CardContent>
              <h4 className="text-sm font-semibold text-[var(--theme-accent)] mb-3">
                {tr('session.correction_tips')}
              </h4>
              <div className="space-y-3">
                {corrections.map((c, i) => (
                  <div key={i} className="border-l-2 border-[var(--theme-accent)] pl-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="status-badge warning">{c.type}</span>
                      <button
                        type="button"
                        onClick={() => playCorrection(c.suggestedText)}
                        className="text-xs text-[var(--theme-accent)] hover:underline flex items-center gap-1"
                        title={tr('session.play_correction')}
                      >
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M5 3l12 7-12 7V3z" />
                        </svg>
                        {tr('session.play_correction')}
                      </button>
                    </div>
                    <p className="text-xs text-[var(--theme-text-secondary)]">
                      <span className="line-through text-[var(--theme-danger)]">{c.originalText}</span>
                      {' → '}
                      <span className="text-[var(--theme-success)]">{c.suggestedText}</span>
                    </p>
                    <p className="text-xs text-[var(--theme-text-muted)]">{c.explanation}</p>
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-3" onClick={continueSpeaking}>
                {tr('session.continue')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {isSessionActive && corrections.length === 0 && !['listening', 'transcribing', 'thinking'].includes(snapshot.state) && (
        <div className="shrink-0 flex justify-center py-4">
          <button
            type="button"
            onClick={continueSpeaking}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{ background: 'var(--theme-accent)' }}
            aria-label="Start speaking"
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
    </div>
  )
}
