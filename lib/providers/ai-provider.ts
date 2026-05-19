import { generateText } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import type { AIProvider, ConversationMessage, ConversationContext, ConversationResponse } from './types'

const SYSTEM_PROMPT = (context: ConversationContext) =>
`You are an English conversation coach. The user is practicing: "${context.scenario.name} - ${context.scenario.description}".
Your accent style is: ${context.accentProfile.name} (${context.accentProfile.region}).
This is turn #${context.turnNumber} in the session.

Your response should:
1. Be conversational and encouraging
2. Include natural corrections for grammar, vocabulary, or pronunciation mistakes
3. Suggest how to improve the next turn

Respond in JSON format:
{
  "text": "your conversational reply to the user",
  "corrections": [
    {
      "type": "grammar|vocabulary|fluency|pronunciation",
      "originalText": "what the user said that needs fixing",
      "suggestedText": "the corrected version",
      "explanation": "why this is better",
      "severity": "minor|moderate|major"
    }
  ]
}
Only include corrections if the user made clear mistakes.`

function getDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return null

  return createDeepSeek({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || undefined,
  })
}

export function createAICoach(): AIProvider {
  const deepseek = getDeepSeek()

  return {
    async generateReply(messages: ConversationMessage[], context: ConversationContext): Promise<ConversationResponse> {
      if (!deepseek) {
        const { createMockAI } = await import('./mock-ai')
        return createMockAI().generateReply(messages, context)
      }

      try {
        const result = await generateText({
          model: deepseek('deepseek-chat'),
          system: SYSTEM_PROMPT(context),
          prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          temperature: 0.7,
          maxOutputTokens: 500,
        })

        const parsed = JSON.parse(result.text)
        return {
          text: parsed.text || result.text,
          corrections: parsed.corrections || [],
          suggestedReply: parsed.text || result.text,
        }
      } catch (err) {
        console.error('DeepSeek API call failed, falling back to mock:', err)
        const { createMockAI } = await import('./mock-ai')
        return createMockAI().generateReply(messages, context)
      }
    },
  }
}
