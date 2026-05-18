import { NextResponse } from 'next/server'
import { createAICoach } from '@/lib/providers/ai-provider'
import { createClient } from '@/lib/supabase/server'

const ai = createAICoach()

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      sessionId: string
      scenario: string
      messages: { role: string; content: string }[]
      turnNumber: number
    }

    const prompt = body.messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join('\n')

    const response = await ai.generateReply(
      [{ role: 'user', content: `Summarize this English conversation practice session about "${body.scenario}". The learner did ${body.turnNumber} turns. ${
        prompt.length > 50
          ? `Here are the coach's responses:\n${prompt.slice(-1000)}`
          : 'Provide general encouragement and 2-3 specific tips.'
      }

Give a brief, encouraging summary in 2-3 sentences. Mention what went well and one thing to focus on next time. Be warm and supportive.` }],
      {
        scenario: { name: body.scenario, description: 'Session summary' },
        accentProfile: { name: 'Coach', region: 'Summary' },
        sessionId: body.sessionId,
        turnNumber: body.turnNumber,
      },
    )

    // Save summary to learning_history if user is authenticated
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('learning_history').insert({
          user_id: user.id,
          summary: response.text,
        })
      }
    } catch {}

    return NextResponse.json({ summary: response.text })
  } catch (e) {
    // Fallback summary
    return NextResponse.json({
      summary: "Great session! You practiced conversation skills and received real-time feedback. Keep up the good work — consistency is key to improving your English fluency.",
    })
  }
}
