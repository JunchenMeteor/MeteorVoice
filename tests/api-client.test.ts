import { describe, expect, it } from 'vitest'
import { createMeteorVoiceApiClient, MeteorVoiceApiError } from '@meteorvoice/api-client'

describe('MeteorVoiceApiClient', () => {
  it('joins baseUrl and sends JSON requests', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = []
    const client = createMeteorVoiceApiClient({
      baseUrl: 'https://example.com/',
      fetch: async (input, init) => {
        calls.push({ input, init })
        return new Response(JSON.stringify({ audioUrl: 'data:audio/mp3;base64,abc', duration: 1.2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })

    const result = await client.synthesizeSpeech({ text: 'Hello', accent: 'General American', speed: 1 })

    expect(result.audioUrl).toContain('data:audio')
    expect(calls[0].input).toBe('https://example.com/api/tts')
    expect(calls[0].init?.method).toBe('POST')
    expect(calls[0].init?.body).toBe(JSON.stringify({ text: 'Hello', accent: 'General American', speed: 1 }))
  })

  it('throws a typed API error for non-2xx responses', async () => {
    const client = createMeteorVoiceApiClient({
      fetch: async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })

    await expect(client.getPreferences()).rejects.toMatchObject({
      name: 'MeteorVoiceApiError',
      message: 'Unauthorized',
      status: 401,
    } satisfies Partial<MeteorVoiceApiError>)
  })

  it('supports async headers for mobile auth sessions', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = []
    const client = createMeteorVoiceApiClient({
      fetch: async (input, init) => {
        calls.push({ input, init })
        return new Response(JSON.stringify({ tts_provider: 'mock' }), { status: 200 })
      },
      headers: async () => ({ Authorization: 'Bearer mobile-token' }),
    })

    await client.getPreferences()

    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer mobile-token')
  })

  it('lists productized scenarios and accents with query parameters', async () => {
    const calls: string[] = []
    const client = createMeteorVoiceApiClient({
      baseUrl: 'https://example.com',
      fetch: async input => {
        calls.push(String(input))
        return new Response(JSON.stringify({ scenarios: [], accents: [], provider: 'mock', available_providers: ['mock'] }), {
          status: 200,
        })
      },
    })

    await client.listScenarios('zh')
    await client.listAccents({ locale: 'en', provider: 'mock' })

    expect(calls).toEqual([
      'https://example.com/api/scenarios?locale=zh',
      'https://example.com/api/accents?locale=en&provider=mock',
    ])
  })

  it('loads turn details through a stable session route', async () => {
    const calls: string[] = []
    const client = createMeteorVoiceApiClient({
      baseUrl: 'https://example.com',
      fetch: async input => {
        calls.push(String(input))
        return new Response(JSON.stringify({ session_id: 's 1', turns: [] }), { status: 200 })
      },
    })

    const result = await client.listSessionTurns('s 1')

    expect(result.turns).toEqual([])
    expect(calls[0]).toBe('https://example.com/api/sessions/s%201/turns')
  })
})
