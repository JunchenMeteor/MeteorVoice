import { NextResponse } from 'next/server'
import { createAICoach } from '@/lib/providers/ai-provider'
import type { ConversationMessage, ConversationContext } from '@/lib/providers/types'

const ai = createAICoach()

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      messages: ConversationMessage[]
      context: ConversationContext
    }

    const response = await ai.generateReply(body.messages, body.context)
    return NextResponse.json(response)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
