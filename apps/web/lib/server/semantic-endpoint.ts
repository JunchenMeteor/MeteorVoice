/**
 * Semantic endpoint detection (LLM-based stop judgment).
 * 语义判停（LLM 判断用户是否说完）。
 */

import { generateText } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import type { ConversationMessage } from '@meteorvoice/shared'

const ENDPOINT_PROMPT = `You are a turn-taking detector for an English conversation practice app.

Judge if the user has finished their turn. Default to "done" — only reply "thinking" if the sentence clearly trails off mid-clause (ends with a conjunction, preposition, article, or incomplete dependent clause).

Reply with exactly one word: done or thinking.

Examples:
- "I went to the store yesterday" → done
- "Yes" → done
- "The weather today is really nice" → done
- "I'm doing well, thanks" → done
- "How about you" → done
- "I think the most important thing is" → thinking
- "For example, my favorite food is pizza because" → thinking
- "So I was wondering if" → thinking
- "I want to ask you about the" → thinking`

let deepseekClient: ReturnType<typeof createDeepSeek> | null = null
let deepseekInit = false

function getDeepSeek() {
  if (deepseekInit) return deepseekClient

  deepseekInit = true
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return null

  deepseekClient = createDeepSeek({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || undefined,
  })
  return deepseekClient
}

export async function createSemanticEndpointCheck() {
  const deepseek = getDeepSeek()

  return async (
    transcript: string,
    context: { messages: ConversationMessage[]; scenario: string },
  ): Promise<'done' | 'thinking'> => {
    if (!deepseek) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[semantic-endpoint] DeepSeek API key not configured, using mock heuristic.')
      }
      return mockSemanticCheck(transcript)
    }

    try {
      const conversationText = context.messages
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
        .join('\n')

      const result = await generateText({
        model: deepseek('deepseek-chat'),
        system: ENDPOINT_PROMPT,
        prompt: [
          `Scenario: ${context.scenario}`,
          `Conversation:`,
          conversationText,
          ``,
          `User is currently saying: "${transcript}"`,
        ].join('\n'),
        temperature: 0.1,
        maxOutputTokens: 5,
      })

      const judgment = result.text.trim().toLowerCase()
      return judgment.includes('done') && !judgment.includes('thinking') ? 'done' : 'thinking'
    } catch (err) {
      console.warn('[semantic-endpoint] DeepSeek call failed, falling back to mock:', err)
      return mockSemanticCheck(transcript)
    }
  }
}

const TRAILING_INCOMPLETE_PATTERN = /(?:^|[\s,，])(?:and|or|but|because|so|then|that|which|who|to|for|with|about|the|a|an|my|your|his|her|their|our|this|these|if|as|while|when|where|why|how)[\s]*$/i

function mockSemanticCheck(transcript: string): 'done' | 'thinking' {
  const normalized = transcript.trim().toLowerCase()

  if (!normalized) return 'thinking'

  // 明显未完的尾部模式
  if (TRAILING_INCOMPLETE_PATTERN.test(normalized)) return 'thinking'

  // 短应答
  if (/^(yes|no|yeah|nope|ok|okay|sure|right|exactly|maybe|please|thanks|sorry|got it|I see|hello|hi|bye)[\s.!?，。！？]*$/i.test(normalized)) {
    return 'done'
  }

  return 'done'
}
