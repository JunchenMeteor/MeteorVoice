/**
 * API request guard, rate limiting, and authentication helpers. / API 请求守卫、限流和鉴权工具。
 */
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

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

type RateLimitResult = {
  allowed: boolean
  request_count: number
  reset_at: string
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

export async function guardApiRequest(request: Request, options: GuardOptions): Promise<ApiErrorResult | null> {
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

  const key = `${options.name}:${getRequestIp(request)}`
  const rateLimit = await checkRateLimit(key, options)
  if (!rateLimit.allowed) {
    return { error: 'Too many requests', status: 429 }
  }

  return null
}

async function checkRateLimit(key: string, options: GuardOptions) {
  if (shouldUsePersistentRateLimit()) {
    const result = await checkPersistentRateLimit(key, options)
    if (result) return result
  }

  return checkMemoryRateLimit(key, options)
}

async function checkPersistentRateLimit(key: string, options: GuardOptions): Promise<{ allowed: boolean } | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('check_api_rate_limit', {
      p_bucket_key: key,
      p_window_ms: options.windowMs,
      p_max_requests: options.maxRequests,
    })
    if (error) throw error

    const row = Array.isArray(data) ? data[0] as Partial<RateLimitResult> | undefined : null
    if (typeof row?.allowed !== 'boolean') return null
    return { allowed: row.allowed }
  } catch {
    return null
  }
}

function checkMemoryRateLimit(key: string, options: GuardOptions) {
  const now = Date.now()
  const current = rateBuckets.get(key)
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + options.windowMs })
    pruneRateBuckets(now)
    return { allowed: true }
  }

  current.count += 1
  if (current.count > options.maxRequests) {
    return { allowed: false }
  }

  return { allowed: true }
}

export async function requireApiUser(): Promise<ApiErrorResult | null> {
  const result = await getApiUser()
  if (isApiErrorResult(result)) return result
  return null
}

export async function getApiUser(): Promise<{ user: User } | ApiErrorResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: 'Authentication required', status: 401 }
  }

  return { user }
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

function shouldUsePersistentRateLimit() {
  return process.env.API_RATE_LIMIT_STORE === 'supabase'
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
