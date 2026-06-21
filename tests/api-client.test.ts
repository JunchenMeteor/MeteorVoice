import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  createMeteorVoiceApiClient,
  formatApiRequestError,
  MeteorVoiceApiError,
  MeteorVoiceApiTimeoutError,
  readApiJsonResponse,
} from '@meteorvoice/api-client'

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
    expect(new Headers(calls[0].init?.headers).get('X-MeteorVoice-Client')).toBe('meteorvoice-api-client')
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

  it('formats API errors for shared web and mobile presentation', () => {
    const error = new MeteorVoiceApiError('Authentication required', 401, { error: 'Authentication required' })

    const result = formatApiRequestError(error, {
      context: 'asr_diagnostic',
      presentation: 'toast',
    })

    expect(result).toMatchObject({
      kind: 'unauthorized',
      status: 401,
      title: 'Sign in required',
      displayMessage: 'Sign in again and try this request.',
      presentation: 'toast',
      severity: 'warning',
      action: 'sign_in',
      actionLabel: 'Sign in',
      autoDismissMs: 4000,
      blocksInteraction: false,
      dismissible: true,
      shouldDisplay: true,
      logData: {
        context: 'asr_diagnostic',
        kind: 'unauthorized',
        status: 401,
        message: 'Authentication required',
      },
    })
  })

  it('aborts requests after the configured timeout', async () => {
    vi.useFakeTimers()
    const client = createMeteorVoiceApiClient({
      timeoutMs: 25,
      maxRetries: 0,
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted')
          error.name = 'AbortError'
          reject(error)
        })
      }),
    })

    const request = client.getPreferences()
    const expectation = expect(request).rejects.toMatchObject({
      name: 'MeteorVoiceApiTimeoutError',
      timeoutMs: 25,
    } satisfies Partial<MeteorVoiceApiTimeoutError>)
    await vi.advanceTimersByTimeAsync(25)

    await expectation
    vi.useRealTimers()
  })

  it('retries on 503 and succeeds on second attempt', async () => {
    let callCount = 0
    const client = createMeteorVoiceApiClient({
      retryBaseDelayMs: 1,
      fetch: async () => {
        callCount++
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Service unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ locale: 'en', tts_provider: 'mock' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })

    const result = await client.getPreferences()
    expect(result.locale).toBe('en')
    expect(callCount).toBe(2)
  })

  it('does not retry on 4xx client errors', async () => {
    let callCount = 0
    const client = createMeteorVoiceApiClient({
      retryBaseDelayMs: 1,
      fetch: async () => {
        callCount++
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })

    await expect(client.getPreferences()).rejects.toThrow()
    expect(callCount).toBe(1)
  })

  it('formats timeout errors as retryable request failures', () => {
    const result = formatApiRequestError(new MeteorVoiceApiTimeoutError('Network request timed out', 15000), {
      context: 'mobile_settings_load',
      presentation: 'blocking',
    })

    expect(result).toMatchObject({
      kind: 'timeout',
      title: 'Request timed out',
      action: 'retry',
      shouldDisplay: true,
      blocksInteraction: true,
      logData: {
        context: 'mobile_settings_load',
        kind: 'timeout',
        timeoutMs: 15000,
      },
    })
  })

  it('converts fetch responses into typed API errors', async () => {
    const response = new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })

    await expect(readApiJsonResponse(response, 'History request failed')).rejects.toMatchObject({
      name: 'MeteorVoiceApiError',
      message: 'Too many requests',
      status: 429,
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

  it('persists locale through preferences PATCH', async () => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = []
    const client = createMeteorVoiceApiClient({
      baseUrl: 'https://example.com',
      fetch: async (input, init) => {
        calls.push({ input, init })
        return new Response(JSON.stringify({ locale: 'zh', tts_provider: 'mock' }), { status: 200 })
      },
    })

    const result = await client.updatePreferences({ locale: 'zh' })

    expect(result.locale).toBe('zh')
    expect(calls[0].input).toBe('https://example.com/api/preferences')
    expect(calls[0].init?.method).toBe('PATCH')
    expect(calls[0].init?.body).toBe(JSON.stringify({ locale: 'zh' }))
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

  it('deletes sessions through the REST session resource route', async () => {
    const calls: { input: string; init?: RequestInit }[] = []
    const client = createMeteorVoiceApiClient({
      baseUrl: 'https://example.com',
      fetch: async (input, init) => {
        calls.push({ input: String(input), init })
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      },
    })

    const result = await client.deleteSession('s 1')

    expect(result.success).toBe(true)
    expect(calls[0].input).toBe('https://example.com/api/sessions/s%201')
    expect(calls[0].init?.method).toBe('DELETE')
  })

  it('exposes ASR provider listing and session bootstrap routes', async () => {
    const calls: { input: string; init?: RequestInit }[] = []
    const client = createMeteorVoiceApiClient({
      baseUrl: 'https://example.com',
      fetch: async (input, init) => {
        calls.push({ input: String(input), init })
        return new Response(JSON.stringify({
          providers: [],
          default_provider: 'native',
          provider: 'native',
          status: 'unsupported',
          sessionId: 'asr_native_1',
          transport: 'native',
          config: { provider: 'native', mode: 'single_utterance', languageMode: 'auto' },
        }), { status: 200 })
      },
    })

    await client.listASRProviders()
    await client.createASRSession({ provider: 'native' })

    expect(calls[0].input).toBe('https://example.com/api/asr/providers')
    expect(calls[1].input).toBe('https://example.com/api/asr/session')
    expect(calls[1].init?.method).toBe('POST')
    expect(calls[1].init?.body).toBe(JSON.stringify({ provider: 'native' }))
  })
})
