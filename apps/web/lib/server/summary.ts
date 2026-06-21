/**
 * Session summary generation. / 会话总结生成。
 */
import { saveSessionSummary } from './turns'
import { createAICoach } from '@/lib/providers/ai-provider'

export const FALLBACK_SESSION_SUMMARY =
  "Great session! You practiced conversation skills and received real-time feedback. Keep up the good work — consistency is key to improving your English fluency."

export async function generateSessionSummary(input: {
  sessionId: string
  scenario: string
  messages: { role: string; content: string }[]
  turnNumber: number
}) {
  const ai = createAICoach()
  const prompt = input.messages
    .filter(message => message.role === 'assistant')
    .map(message => message.content)
    .join('\n')

  const response = await ai.generateReply(
    [{ role: 'user', content: `Summarize this English conversation practice session about "${input.scenario}". The learner did ${input.turnNumber} turns. ${
      prompt.length > 50
        ? `Here are the coach's responses:\n${prompt.slice(-1000)}`
        : 'Provide general encouragement and 2-3 specific tips.'
    }

Give a brief, encouraging summary in 2-3 sentences. Mention what went well and one thing to focus on next time. Be warm and supportive.` }],
    {
      scenario: { name: input.scenario, description: 'Session summary' },
      accentProfile: { name: 'Coach', region: 'Summary' },
      sessionId: input.sessionId,
      turnNumber: input.turnNumber,
    },
  )

  await saveSessionSummary({ userSummary: response.text, sessionId: input.sessionId })
  return response.text
}
