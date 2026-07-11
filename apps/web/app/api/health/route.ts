/**
 * Process-local health endpoint used by Docker and deployment checks.
 */
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ service: 'meteorvoice-web', status: 'ok' })
}
