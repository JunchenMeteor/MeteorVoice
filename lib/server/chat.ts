import { findCommonErrors, retrieveRelevantContext } from '@/lib/retrieval'
import type { ConversationContext, ConversationMessage } from '@/lib/providers/types'
import { createAICoach } from '@/lib/providers/ai-provider'

export async function generateCoachReply(messages: ConversationMessage[], context: ConversationContext) {
  const ai = createAICoach()
  const lastUserMsg = [...messages].reverse().find(message => message.role === 'user')
  const retrievalContext = lastUserMsg
    ? retrieveRelevantContext(lastUserMsg.content, context.scenario.name)
    : []
  const errorTips = lastUserMsg ? findCommonErrors(lastUserMsg.content) : []

  const recentMessages = messages.slice(-8)
  const ragMessages = [...recentMessages]
  if (retrievalContext.length > 0 || errorTips.length > 0) {
    const contextParts: string[] = []
    if (retrievalContext.length > 0) {
      contextParts.push('Coaching guidance: ' + retrievalContext.map(result => result.content).join(' '))
    }
    if (errorTips.length > 0) {
      contextParts.push('Common errors to watch for: ' + errorTips.join(' '))
    }
    ragMessages.unshift({ role: 'system', content: contextParts.join('\n') })
  }

  return ai.generateReply(ragMessages, context)
}
