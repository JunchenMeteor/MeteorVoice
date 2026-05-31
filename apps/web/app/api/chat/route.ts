import type { ConversationMessage, ConversationContext } from '@/lib/providers/types'
import { generateCoachReply } from '@/lib/server/chat'
import { guardApiRequest, jsonApiResult, jsonServerError, requireApiUser } from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const guard = guardApiRequest(request, { name: 'chat', windowMs: 60_000, maxRequests: 30, requireClientHeader: true })
    if (guard) return jsonApiResult(guard)
    const auth = await requireApiUser()
    if (auth) return jsonApiResult(auth)
    const body = await request.json() as {
      messages: ConversationMessage[]
      context: ConversationContext
    }
    const response = await generateCoachReply(body.messages, body.context)
    return jsonApiResult(response)
  } catch (e) {
    return jsonServerError(e)
  }
}
