/**
 * API request guard, rate limiting, and authentication helpers. / API 请求守卫、限流和鉴权工具。
 */
import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export type ApiErrorResult = {
  error: string
  status: number
}

type GuardOptions = {
  name: string
  windowMs: number
  maxRequests: number
  requireClientHeader?: boolean
}

type RateBucket = {
  count: number
  resetAt: number
}

const rateBuckets = new Map<string, RateBucket>()
const trustedClientHeaders = new Set(['meteorvoice-api-client', 'meteorvoice-web', 'meteorvoice-mobile'])
const defaultBlockedCountries = ['JP']

export function isApiErrorResult(value: unknown): value is ApiErrorResult {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'error' in value &&
    'status' in value,
  )
}

export function jsonApiResult<T>(result: T | ApiErrorResult) {
  if (isApiErrorResult(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result)
}

export function jsonServerError(error: unknown, fallback = 'Internal server error') {
  const message = getErrorMessage(error, fallback)
  return NextResponse.json({ error: message }, { status: 500 })
}

export function guardApiRequest(request: Request, options: GuardOptions): ApiErrorResult | null {
  const country = request.headers.get('x-vercel-ip-country')?.toUpperCase()
  if (country && getBlockedApiCountries().includes(country)) {
    return { error: 'Request blocked', status: 403 }
  }

  if (options.requireClientHeader) {
    const client = request.headers.get('x-meteorvoice-client')?.trim()
    if (!client || !trustedClientHeaders.has(client)) {
      return { error: 'Missing client identification', status: 403 }
    }
  }

  const now = Date.now()
  const key = `${options.name}:${getRequestIp(request)}`
  const current = rateBuckets.get(key)
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + options.windowMs })
    pruneRateBuckets(now)
    return null
  }

  current.count += 1
  if (current.count > options.maxRequests) {
    return { error: 'Too many requests', status: 429 }
  }

  return null
}

export async function requireApiUser(): Promise<ApiErrorResult | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: 'Authentication required', status: 401 }
  }

  return null
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (!error || typeof error !== 'object') return fallback

  const record = error as Record<string, unknown>
  const message = typeof record.message === 'string' ? record.message : null
  const apiError = typeof record.error === 'string' ? record.error : null
  const code = typeof record.code === 'string' ? record.code : null
  const details = typeof record.details === 'string' ? record.details : null
  const hint = typeof record.hint === 'string' ? record.hint : null

  return [message ?? apiError, code, details, hint].filter(Boolean).join(' - ') || fallback
}

function getBlockedApiCountries() {
  const configured = process.env.API_GUARD_BLOCKED_COUNTRIES
  if (!configured?.trim()) return defaultBlockedCountries
  return configured
    .split(',')
    .map(country => country.trim().toUpperCase())
    .filter(Boolean)
}

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    forwardedFor ||
    'unknown'
}

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < 2000) return
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  }
}
