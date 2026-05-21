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
  const message = error instanceof Error ? error.message : String(error || fallback)
  return NextResponse.json({ error: message }, { status: 500 })
}
