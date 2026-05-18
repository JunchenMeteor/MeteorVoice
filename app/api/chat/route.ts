import { NextResponse } from 'next/server'
import { createAICoach } from '@/lib/providers/ai-provider'
import type { ConversationMessage, ConversationContext } from '@/lib/providers/types'
import { retrieveRelevantContext, findCommonErrors } from '@/lib/retrieval'

const ai = createAICoach()

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      messages: ConversationMessage[]
      context: ConversationContext
    }

    // RAG: retrieve relevant scenario guidance and correction tips
    const lastUserMsg = [...body.messages].reverse().find(m => m.role === 'user')
    const retrievalContext = lastUserMsg
      ? retrieveRelevantContext(lastUserMsg.content, body.context.scenario.name)
      : []

    // Check for common Chinese-English errors
    const errorTips = lastUserMsg ? findCommonErrors(lastUserMsg.content) : []

    // Inject retrieval context as a system message
    const ragMessages = [...body.messages]
    if (retrievalContext.length > 0 || errorTips.length > 0) {
      const contextParts: string[] = []
      if (retrievalContext.length > 0) {
        contextParts.push('Coaching guidance: ' + retrievalContext.map(r => r.content).join(' '))
      }
      if (errorTips.length > 0) {
        contextParts.push('Common errors to watch for: ' + errorTips.join(' '))
      }
      ragMessages.unshift({ role: 'system', content: contextParts.join('\n') })
    }

    const response = await ai.generateReply(ragMessages, body.context)
    return NextResponse.json(response)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
