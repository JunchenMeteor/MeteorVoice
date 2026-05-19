import type { AIProvider, ConversationMessage, ConversationContext, ConversationResponse } from './types'

const coachReplies: Record<string, string[]> = {
  interview: [
    "That's a good start. Let's practice a common question: \"Tell me about yourself.\" Remember to keep it concise — about 45 seconds — and focus on your professional background.",
    "When answering, use the STAR method: Situation, Task, Action, Result. Try again with more structure.",
    'Good effort! Your vocabulary is solid. For the next round, try to sound more confident by pausing between key points.',
  ],
  travel: [
    "Welcome to travel practice! Imagine you're checking in at a hotel. The receptionist asks: \"Do you have a reservation?\" How would you respond?",
    "Good! Now let's try asking for directions. Remember to say \"Could you tell me how to get to...\" instead of just \"Where is...\" to sound more polite.",
    'Nice job navigating that situation. Your pronunciation of location names was clear.',
  ],
  'small-talk': [
    "Let's practice casual conversation. Someone says: \"How was your weekend?\" What would you say to keep the conversation going?",
    "Good! Remember to ask follow-up questions. If someone mentions their hobby, ask \"How long have you been doing that?\" or \"What got you into it?\"",
    'Your small talk is improving! Try to sound more natural by adding short reactions like "Oh, that sounds fun!" or "Really? Tell me more."',
  ],
  restaurant: [
    "You're at a restaurant and the waiter approaches. \"Good evening! Are you ready to order, or do you need a few more minutes?\"",
    "Good ordering! When specifying preferences, use \"I'd like\" instead of \"I want\" — it's more polite in dining situations.",
    "Let's practice handling a special request. Imagine you need to ask about allergens or dietary restrictions.",
  ],
  workplace: [
    "You're in a team meeting. Your manager asks: \"Can you give us an update on the project status?\" Practice a clear, brief update.",
    "Your project update was clear! For meetings, structure updates as: achieved, in-progress, blockers, next steps.",
    "Let's practice disagreeing politely. Instead of \"That won't work,\" try \"I see your point, but have we considered...\"",
  ],
}

const defaultReplies = [
  "Let's start our conversation practice. I'll be your coach today. Try to speak naturally, and I'll give tips along the way.",
  "Good try! Let me give you some feedback. Try speaking a bit more slowly — it helps with clarity and gives you time to think.",
  "That was great! Your English is improving. Let's continue with a new topic.",
]

const mockCorrections: ConversationResponse['corrections'] = [
  { type: 'grammar', originalText: 'I goes to school', suggestedText: 'I go to school', explanation: 'Third-person "s" only applies to he/she/it, not "I".', severity: 'minor' },
  { type: 'vocabulary', originalText: 'I want to make a reservation', suggestedText: 'I would like to make a reservation', explanation: '"Would like" is more polite than "want" in service situations.', severity: 'minor' },
  { type: 'pronunciation', originalText: 'com-fort-a-ble', suggestedText: 'comf-ta-ble', explanation: 'Native speakers drop the middle syllable. Say "comf-ta-ble", not "com-fort-a-ble".', severity: 'moderate' },
]

let globalTurnCount = 0

export function createMockAI(): AIProvider {
  return {
    async generateReply(_messages: ConversationMessage[], context: ConversationContext): Promise<ConversationResponse> {
      await sleep(300 + Math.random() * 600)
      globalTurnCount++

      const scenarioKey = context.scenario.name.toLowerCase().replace(/\s+/g, '-')
      const replies = coachReplies[scenarioKey as keyof typeof coachReplies] ?? defaultReplies
      const replyText = replies[globalTurnCount % replies.length]
      const shouldCorrect = Math.random() > 0.5

      return {
        text: replyText,
        corrections: shouldCorrect
          ? [mockCorrections[Math.floor(Math.random() * mockCorrections.length)]]
          : [],
        suggestedReply: replyText,
      }
    },
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
