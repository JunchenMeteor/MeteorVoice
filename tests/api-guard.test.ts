import {
  describe,
  expect,
  it,
} from 'vitest'

import { guardApiRequest } from '@/lib/server/http'

describe('API guard', () => {
  it('blocks configured abusive countries before expensive handlers run', () => {
    const request = new Request('https://meteorvoice.test/api/chat', {
      headers: {
        'x-vercel-ip-country': 'JP',
        'x-meteorvoice-client': 'meteorvoice-web',
      },
    })

    expect(guardApiRequest(request, {
      name: 'guard_country_test',
      windowMs: 60000,
      maxRequests: 10,
      requireClientHeader: true,
    })).toEqual({ error: 'Request blocked', status: 403 })
  })

  it('requires trusted client identification for high cost routes', () => {
    const request = new Request('https://meteorvoice.test/api/tts', {
      headers: { 'x-vercel-ip-country': 'US' },
    })

    expect(guardApiRequest(request, {
      name: 'guard_header_test',
      windowMs: 60000,
      maxRequests: 10,
      requireClientHeader: true,
    })).toEqual({ error: 'Missing client identification', status: 403 })
  })

  it('rate limits repeated requests per route and IP', () => {
    const makeRequest = () => new Request('https://meteorvoice.test/api/chat', {
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'x-vercel-ip-country': 'US',
        'x-meteorvoice-client': 'meteorvoice-web',
      },
    })

    expect(guardApiRequest(makeRequest(), {
      name: 'guard_rate_test',
      windowMs: 60000,
      maxRequests: 1,
      requireClientHeader: true,
    })).toBeNull()
    expect(guardApiRequest(makeRequest(), {
      name: 'guard_rate_test',
      windowMs: 60000,
      maxRequests: 1,
      requireClientHeader: true,
    })).toEqual({ error: 'Too many requests', status: 429 })
  })
})
