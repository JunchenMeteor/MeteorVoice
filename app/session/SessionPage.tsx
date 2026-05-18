'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useCallback } from 'react'
import { scenarios, accentProfiles, type AccentProfile } from '@/lib/scenarios'
import { createMockSTT } from '@/lib/providers/mock-stt'
import { createMockTTS } from '@/lib/providers/mock-tts'
import { transition, createInitialSnapshot, type WorkflowState, type WorkflowSnapshot } from '@/lib/conversation-workflow'
import type { ConversationMessage, ConversationResponse } from '@/lib/providers/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const stt = createMockSTT()
const tts = createMockTTS()

export function SessionPageClient() {
  const router = useRouter()
  const params = useSearchParams()
  const scenarioKey = params.get('scenario') ?? 'small-talk'
  const accentKey = params.get('accent') ?? 'american'

  const scenario = scenarios.find(s => s.key === scenarioKey) ?? scenarios[0]
  const accent = accentProfiles.find(a => a.key === accentKey) ?? accentProfiles[0]

  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(() =>
    createInitialSnapshot(crypto.randomUUID()),
  )
  const [statusText, setStatusText] = useState('Ready')
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [corrections, setCorrections] = useState<ConversationResponse['corrections']>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages: ConversationMessage[] = snapshot.messages

  const applyTransition = useCallback((to: WorkflowState, patch: Partial<WorkflowSnapshot> = {}) => {
    setSnapshot(prev => transition(prev, to, { ...patch }))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [snapshot.messages.length])

  function startSession() {
    setIsSessionActive(true)
    setStatusText('Listening...')
    applyTransition('listening')
    simulateTurn()
  }

  function endSession() {
    setIsSessionActive(false)
    applyTransition('session_ended')
    setStatusText('Session ended')
    // Save to localStorage history
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
      })
      localStorage.setItem('meteorvoice-history', JSON.stringify(history.slice(0, 50)))
    } catch {}
  }

  async function simulateTurn() {
    setStatusText('Listening...')
    applyTransition('listening')
    await sleep(1500)

    setStatusText('Transcribing...')
    applyTransition('transcribing')
    const { transcript } = await stt.transcribe(new Blob())
    applyTransition('transcribing', { lastTranscript: transcript })

    const userMsg: ConversationMessage = { role: 'user', content: transcript }
    setSnapshot(prev => ({ ...prev, messages: [...prev.messages, userMsg] }))
    await sleep(500)

    setStatusText('Coach is thinking...')
    applyTransition('thinking')
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...snapshot.messages, userMsg],
        context: {
          scenario: { name: scenario.name, description: scenario.description },
          accentProfile: { name: accent.name, region: accent.region },
          sessionId: snapshot.sessionId,
          turnNumber: snapshot.turnNumber + 1,
        },
      }),
    })
    const response: ConversationResponse = await res.json()
    applyTransition('thinking', { lastResponse: response.text })
    await sleep(300)

    setStatusText('Speaking...')
    applyTransition('speaking')
    await tts.synthesize(response.text, { accent: accent.name })
    const assistantMsg: ConversationMessage = { role: 'assistant', content: response.text }
    setSnapshot(prev => ({ ...prev, messages: [...prev.messages, assistantMsg] }))

    if (response.corrections.length > 0) {
      setCorrections(response.corrections)
      applyTransition('correcting', { lastCorrections: response.corrections })
      setStatusText('Coach suggests corrections')
    } else {
      setStatusText('Tap mic to continue')
      applyTransition('idle')
    }
  }

  function continueSpeaking() {
    setCorrections([])
    setStatusText('Listening...')
    simulateTurn()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col h-full">
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
          <Button variant="danger" size="sm" onClick={endSession}>End Session</Button>
        ) : (
          <Button size="sm" onClick={startSession}>Start Session</Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: isSessionActive ? 'var(--theme-success)' : 'var(--theme-text-muted)' }}
        />
        <span className="text-sm text-[var(--theme-text-secondary)]">{statusText}</span>
      </div>

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
              Press <span className="font-semibold text-[var(--theme-accent)]">Start Session</span> to begin
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
                Correction Tips
              </h4>
              <div className="space-y-3">
                {corrections.map((c, i) => (
                  <div key={i} className="border-l-2 border-[var(--theme-accent)] pl-3 space-y-1">
                    <span className="status-badge warning">{c.type}</span>
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
                Continue Speaking
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
