import { NextResponse } from 'next/server'

export type ApiErrorResult = {
  error: string
  status: number
}

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
