import { generateText } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import type { AIProvider, ConversationMessage, ConversationContext, ConversationResponse } from './types'

const SYSTEM_PROMPT = (context: ConversationContext) =>
`You are an English conversation coach. The user is practicing: "${context.scenario.name} - ${context.scenario.description}".
Your accent style is: ${context.accentProfile.name} (${context.accentProfile.region}).
This is turn #${context.turnNumber} in the session.

Spoken reply policy:
1. Keep "text" brief and conversational because it will be spoken aloud.
2. Default to one short sentence. Use at most two short sentences when needed.
3. For greetings, backchannels, or very short answers, reply with one natural reaction plus one easy follow-up question.
4. Match the user's confidence and input length; do not lecture after a short user utterance.
5. Put teaching details, grammar explanations, and improvement notes in "corrections", not in "text".
6. Only use a longer "text" when the user explicitly asks for an explanation, example, or detailed feedback.
7. Keep the conversation moving with a simple next prompt.

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

function userAskedForDetail(messages: ConversationMessage[]) {
  const lastUserMessage = [...messages].reverse().find(message => message.role === 'user')?.content.toLowerCase() ?? ''
  return /\b(explain|why|how|detail|example|feedback|grammar|correct|correction)\b/.test(lastUserMessage)
}

function trimSpokenReply(text: string, allowLong: boolean) {
  const normalized = text.trim()
  if (allowLong || normalized.length <= 220) return normalized

  const sentences = normalized.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)
  if (!sentences || sentences.length <= 2) return normalized

  return sentences.slice(0, 2).join(' ').trim()
}

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
        const allowLongReply = userAskedForDetail(messages)
        const result = await generateText({
          model: deepseek('deepseek-chat'),
          system: SYSTEM_PROMPT(context),
          prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          temperature: 0.55,
          maxOutputTokens: allowLongReply ? 260 : 180,
        })

        const parsed = JSON.parse(result.text)
        const text = trimSpokenReply(parsed.text || result.text, allowLongReply)
        return {
          text,
          corrections: parsed.corrections || [],
          suggestedReply: parsed.suggestedReply || text,
        }
      } catch (err) {
        console.error('DeepSeek API call failed, falling back to mock:', err)
        const { createMockAI } = await import('./mock-ai')
        return createMockAI().generateReply(messages, context)
      }
    },
  }
}
