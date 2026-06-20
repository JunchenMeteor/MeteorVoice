/**
 * AI coach provider (DeepSeek via Vercel AI SDK).
 * AI 教练提供者（DeepSeek + Vercel AI SDK）。
 */

import { generateText } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import type { AIProvider, ConversationMessage, ConversationContext, ConversationResponse } from './types'

function responseLanguageInstruction(context: ConversationContext) {
  if (context.responseLocale === 'zh') {
    return [
      'The UI language preference is Simplified Chinese, but the product goal is English speaking practice.',
      'Choose the spoken "text" language from the user message and intent:',
      '- If the user is mostly speaking English, reply in English and briefly explain any Chinese phrase in English.',
      '- If the user is mostly speaking Chinese, reply in Simplified Chinese unless they are asking how to say something in English.',
      '- If the user is asking for the English wording, meaning, translation, alternative phrasing, or natural expression for a Chinese or mixed-language phrase, reply in English and give the English expression.',
      'Keep English examples or replacement phrases in English when teaching vocabulary or grammar.',
    ].join(' ')
  }
  return [
    'Reply in English for the spoken "text" and correction explanations.',
    'If the user includes Chinese words, explain the meaning in English and give a natural English replacement.',
    'Avoid putting Chinese characters in the spoken "text"; put the original Chinese text in corrections instead.',
  ].join(' ')
}

const SYSTEM_PROMPT = (context: ConversationContext) =>
`You are an English conversation coach. The user is practicing: "${context.scenario.name} - ${context.scenario.description}".
Your accent style is: ${context.accentProfile.name} (${context.accentProfile.region}).
This is turn #${context.turnNumber} in the session.
Response language: ${responseLanguageInstruction(context)}

Spoken reply policy:
1. Keep "text" brief and conversational because it will be spoken aloud.
2. Default to one short sentence. Use at most two short sentences when needed.
3. Always follow the user's topic — react to what they actually said before asking anything.
4. Only ask a follow-up question if it naturally extends what the user just said. Never restart the scenario, redirect to a new topic, or ask the user to "say a simple sentence".
5. Match the user's energy: a short answer gets a short reaction; a detailed answer can get a slightly fuller response.
6. Put teaching details, grammar explanations, and improvement notes in "corrections", not in "text".
7. Only use a longer "text" when the user explicitly asks for an explanation, example, or detailed feedback.
8. If the user's English sentence contains Chinese words or phrases, keep the spoken "text" brief but explain the Chinese word aloud once, using a natural phrase such as: "You can say ... for ...". Then continue the conversation.
9. For mixed English-Chinese input, also add a vocabulary correction whose "originalText" is the Chinese word or phrase and whose "suggestedText" is the natural English replacement.
10. On every turn, review the latest user sentence for clear grammar, vocabulary, or fluency mistakes. If there is a clear mistake, add a correction item even if the conversation can continue naturally.
11. If you correct a mistake, keep "text" supportive and continuous: briefly acknowledge the intended meaning, then continue the same topic. Do not make the correction feel like a reset.

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
Only include corrections if the user made clear mistakes, except mixed English-Chinese input MUST receive the vocabulary correction described above.`

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

/**
 * Create an AI conversation coach provider backed by DeepSeek, with automatic fallback to mock AI.
 * 创建基于 DeepSeek 的 AI 对话教练提供者，失败时自动回退到模拟 AI。
 */
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
