import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  parseChatRequest,
  parseSessionSyncRequest,
  parseSummaryRequest,
  parseTTSRequest,
  parseTurnRequest,
  readJsonRequest,
} from '@/lib/server/api-input'

const validContext = {
  scenario: { name: 'Small talk', description: 'Practice casual conversation' },
  accentProfile: { name: 'American', region: 'United States' },
  sessionId: 'session-1',
  turnNumber: 1,
  responseLocale: 'en',
}

describe('API input validation', () => {
  it('rejects a request body that exceeds the declared byte limit', async () => {
    const request = new Request('https://meteorvoice.test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(100) }),
    })

    await expect(readJsonRequest(request, 32)).resolves.toEqual({
      error: 'Request body is too large',
      status: 413,
    })
  })

  it('accepts a bounded chat request and rejects invalid message roles', () => {
    expect(parseChatRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      context: validContext,
    })).toMatchObject({ value: { context: validContext } })

    expect(parseChatRequest({
      messages: [{ role: 'admin', content: 'Hello' }],
      context: validContext,
    })).toEqual({ error: 'Invalid chat messages', status: 400 })
  })

  it('rejects oversized chat and TTS text', () => {
    expect(parseChatRequest({
      messages: [{ role: 'user', content: 'x'.repeat(4001) }],
      context: validContext,
    })).toEqual({ error: 'Invalid chat messages', status: 400 })

    expect(parseTTSRequest({ text: 'x'.repeat(4001) })).toEqual({
      error: 'Text is too long',
      status: 400,
    })
  })

  it('validates summary, turn, and session-sync payloads', () => {
    expect(parseSummaryRequest({
      sessionId: 'session-1',
      scenario: 'Small talk',
      messages: [{ role: 'assistant', content: 'Good job' }],
      turnNumber: 3,
    })).toHaveProperty('value')

    expect(parseTurnRequest({
      session_id: 'session-1',
      speaker: 'intruder',
      transcript: 'hello',
    })).toEqual({ error: 'Invalid speaker', status: 400 })

    expect(parseSessionSyncRequest({
      session_id: 'session-1',
      scenario: 'Small talk',
      accent: 'American',
      turns: 1,
      messages: [{ role: 'user', content: 'Hello' }],
      corrections: [{
        type: 'grammar',
        originalText: 'I is',
        suggestedText: 'I am',
        explanation: 'Use am with I',
        severity: 'invalid',
      }],
    })).toEqual({ error: 'Invalid corrections', status: 400 })
  })
})
