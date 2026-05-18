import { describe, it, expect } from 'vitest'
import {
  createInitialSnapshot,
  transition,
  snapshotSummary,
  VALID_TRANSITIONS,
} from '@/lib/conversation-workflow'

describe('conversation-workflow', () => {
  it('creates initial snapshot in idle state', () => {
    const snap = createInitialSnapshot('test-session-1')
    expect(snap.state).toBe('idle')
    expect(snap.sessionId).toBe('test-session-1')
    expect(snap.messages).toEqual([])
    expect(snap.turnNumber).toBe(0)
    expect(snap.error).toBeNull()
  })

  it('allows valid transition: idle → listening', () => {
    const snap = createInitialSnapshot('s1')
    const next = transition(snap, 'listening')
    expect(next.state).toBe('listening')
    expect(next.turnNumber).toBe(1)
    expect(next.error).toBeNull()
  })

  it('rejects invalid transition: idle → speaking', () => {
    const snap = createInitialSnapshot('s1')
    const next = transition(snap, 'speaking')
    expect(next.state).toBe('idle')
    expect(next.error).toContain('Invalid transition')
  })

  it('full happy path: idle → listening → transcribing → thinking → speaking → idle', () => {
    let snap = createInitialSnapshot('s2')

    snap = transition(snap, 'listening')
    expect(snap.state).toBe('listening')
    expect(snap.turnNumber).toBe(1)

    snap = transition(snap, 'transcribing', { lastTranscript: 'hello' })
    expect(snap.state).toBe('transcribing')
    expect(snap.lastTranscript).toBe('hello')

    snap = transition(snap, 'thinking')
    expect(snap.state).toBe('thinking')

    snap = transition(snap, 'speaking', { lastResponse: 'Hi there!' })
    expect(snap.state).toBe('speaking')
    expect(snap.lastResponse).toBe('Hi there!')
  })

  it('correcting path: speaking → correcting → session_ended', () => {
    let snap = createInitialSnapshot('s3')
    snap = transition(snap, 'listening')
    snap = transition(snap, 'transcribing')
    snap = transition(snap, 'thinking')
    snap = transition(snap, 'speaking')
    snap = transition(snap, 'correcting', { lastCorrections: [{ type: 'grammar', originalText: 'x', suggestedText: 'y', explanation: 'z', severity: 'minor' }] })
    expect(snap.state).toBe('correcting')
    expect(snap.lastCorrections).toHaveLength(1)

    snap = transition(snap, 'session_ended')
    expect(snap.state).toBe('session_ended')
  })

  it('session_ended is terminal', () => {
    let snap = createInitialSnapshot('s4')
    snap = transition(snap, 'listening')
    snap = transition(snap, 'transcribing')
    snap = transition(snap, 'thinking')
    snap = transition(snap, 'speaking')
    snap = transition(snap, 'correcting')
    snap = transition(snap, 'session_ended')
    expect(snap.state).toBe('session_ended')

    const next = transition(snap, 'idle')
    expect(next.error).toContain('Invalid transition')
  })

  it('snapshotSummary returns correct summary', () => {
    const snap = createInitialSnapshot('s5')
    const s = snapshotSummary(snap)
    expect(s.state).toBe('idle')
    expect(s.turnNumber).toBe(0)
    expect(s.messageCount).toBe(0)
    expect(s.hasPendingCorrections).toBe(false)
  })
})
