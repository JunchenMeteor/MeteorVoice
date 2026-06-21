import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { guardApiRequest } from '@/lib/server/http'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'

const createClientMock = vi.mocked(createClient)

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('API guard', () => {
  it('blocks configured abusive countries before expensive handlers run', async () => {
    const request = new Request('https://meteorvoice.test/api/chat', {
      headers: {
        'x-vercel-ip-country': 'JP',
        'x-meteorvoice-client': 'meteorvoice-web',
      },
    })

    await expect(guardApiRequest(request, {
      name: 'guard_country_test',
      windowMs: 60000,
      maxRequests: 10,
      requireClientHeader: true,
    })).resolves.toEqual({ error: 'Request blocked', status: 403 })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('requires trusted client identification for high cost routes', async () => {
    const request = new Request('https://meteorvoice.test/api/tts', {
      headers: { 'x-vercel-ip-country': 'US' },
    })

    await expect(guardApiRequest(request, {
      name: 'guard_header_test',
      windowMs: 60000,
      maxRequests: 10,
      requireClientHeader: true,
    })).resolves.toEqual({ error: 'Missing client identification', status: 403 })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('rate limits repeated requests per route and IP in memory by default', async () => {
    const makeRequest = () => new Request('https://meteorvoice.test/api/chat', {
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'x-vercel-ip-country': 'US',
        'x-meteorvoice-client': 'meteorvoice-web',
      },
    })

    await expect(guardApiRequest(makeRequest(), {
      name: 'guard_rate_test',
      windowMs: 60000,
      maxRequests: 1,
      requireClientHeader: true,
    })).resolves.toBeNull()
    await expect(guardApiRequest(makeRequest(), {
      name: 'guard_rate_test',
      windowMs: 60000,
      maxRequests: 1,
      requireClientHeader: true,
    })).resolves.toEqual({ error: 'Too many requests', status: 429 })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('uses Supabase RPC when persistent rate limit is enabled', async () => {
    vi.stubEnv('API_RATE_LIMIT_STORE', 'supabase')
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, request_count: 2, reset_at: '2026-01-01T00:00:00Z' }],
      error: null,
    })
    createClientMock.mockResolvedValue({ rpc } as never)
    const request = new Request('https://meteorvoice.test/api/chat', {
      headers: {
        'x-forwarded-for': '203.0.113.2',
        'x-vercel-ip-country': 'US',
        'x-meteorvoice-client': 'meteorvoice-web',
      },
    })

    await expect(guardApiRequest(request, {
      name: 'guard_persistent_test',
      windowMs: 60000,
      maxRequests: 1,
      requireClientHeader: true,
    })).resolves.toEqual({ error: 'Too many requests', status: 429 })

    expect(rpc).toHaveBeenCalledWith('check_api_rate_limit', {
      p_bucket_key: 'guard_persistent_test:203.0.113.2',
      p_window_ms: 60000,
      p_max_requests: 1,
    })
  })

  it('falls back to in-memory rate limit if Supabase RPC fails', async () => {
    vi.stubEnv('API_RATE_LIMIT_STORE', 'supabase')
    createClientMock.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('RPC failed') }),
    } as never)
    const makeRequest = () => new Request('https://meteorvoice.test/api/chat', {
      headers: {
        'x-forwarded-for': '203.0.113.3',
        'x-vercel-ip-country': 'US',
        'x-meteorvoice-client': 'meteorvoice-web',
      },
    })

    await expect(guardApiRequest(makeRequest(), {
      name: 'guard_fallback_test',
      windowMs: 60000,
      maxRequests: 1,
      requireClientHeader: true,
    })).resolves.toBeNull()
    await expect(guardApiRequest(makeRequest(), {
      name: 'guard_fallback_test',
      windowMs: 60000,
      maxRequests: 1,
      requireClientHeader: true,
    })).resolves.toEqual({ error: 'Too many requests', status: 429 })
  })
})
