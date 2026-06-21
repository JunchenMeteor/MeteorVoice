/**
 * Semantic endpoint health check. / 语义端点健康检查。
 */
import { createSemanticEndpointCheck } from '@/lib/server/semantic-endpoint'
import {
  guardApiRequest,
  jsonApiResult,
  jsonServerError,
  requireApiUser,
} from '@/lib/server/http'

const MAX_TRANSCRIPT_LENGTH = 2000
const MAX_MESSAGES = 8
const MAX_MESSAGE_LENGTH = 2000
const MAX_SCENARIO_LENGTH = 80

function isConversationMessage(value: unknown): value is { role: 'user' | 'assistant'; content: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    ('role' in value) &&
    ('content' in value) &&
    ((value as { role: unknown }).role === 'user' || (value as { role: unknown }).role === 'assistant') &&
    typeof (value as { content: unknown }).content === 'string',
  )
}

let checkPromise: ReturnType<typeof createSemanticEndpointCheck> | null = null

async function getCheck() {
  if (!checkPromise) {
    checkPromise = createSemanticEndpointCheck()
  }
  return checkPromise
}

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'semantic_endpoint', windowMs: 60_000, maxRequests: 120, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const body = await request.json() as unknown
    if (!body || typeof body !== 'object') {
      return jsonApiResult({ error: 'Invalid request body', status: 400 })
    }

    const input = body as {
      transcript?: unknown
      messages?: unknown
      scenario?: unknown
    }

    if (typeof input.transcript !== 'string') {
      return jsonApiResult({ error: 'Transcript is required', status: 400 })
    }

    const transcript = input.transcript.trim()
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return jsonApiResult({ error: 'Transcript is too long', status: 400 })
    }

    const messages = Array.isArray(input.messages)
      ? input.messages
        .slice(-MAX_MESSAGES)
        .filter(isConversationMessage)
        .map(message => ({
          role: message.role,
          content: message.content.slice(0, MAX_MESSAGE_LENGTH),
        }))
      : []

    const scenario = typeof input.scenario === 'string'
      ? input.scenario.slice(0, MAX_SCENARIO_LENGTH)
      : 'general'

    if (!transcript) {
      return jsonApiResult({ judgment: 'done' })
    }

    const check = await getCheck()
    const judgment = await check(transcript, {
      messages,
      scenario,
    })

    return jsonApiResult({ judgment })
  } catch (e) {
    return jsonServerError(e)
  }
}
