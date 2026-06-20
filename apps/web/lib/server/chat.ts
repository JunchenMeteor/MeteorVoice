/**
 * AI coach chat generation. / AI 教练对话生成。
 */
import {
  buildMixedChineseSpokenHint,
  findCommonCorrections,
  findCommonErrors,
  retrieveRelevantContext,
} from '@/lib/retrieval'
import type { ConversationContext, ConversationMessage } from '@/lib/providers/types'
import { createAICoach } from '@/lib/providers/ai-provider'

export async function generateCoachReply(messages: ConversationMessage[], context: ConversationContext) {
  const ai = createAICoach()
  const lastUserMsg = [...messages].reverse().find(message => message.role === 'user')
  const responseLocale = context.responseLocale === 'zh' ? 'zh' : 'en'
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

  const response = await ai.generateReply(ragMessages, { ...context, responseLocale })
  if (!lastUserMsg) return response

  const requiredCorrections = findCommonCorrections(lastUserMsg.content, responseLocale)
  const mergedCorrections = [...response.corrections]
  for (const correction of requiredCorrections) {
    const duplicate = mergedCorrections.some(existing =>
      existing.type === correction.type &&
      existing.originalText.toLowerCase() === correction.originalText.toLowerCase(),
    )
    if (!duplicate) mergedCorrections.push(correction)
  }

  const mixedChineseHint = buildMixedChineseSpokenHint(lastUserMsg.content, responseLocale)
  const text = mixedChineseHint && !response.text.includes(mixedChineseHint)
    ? `${mixedChineseHint} ${response.text}`.trim()
    : response.text

  return {
    ...response,
    text,
    corrections: mergedCorrections,
  }
}
