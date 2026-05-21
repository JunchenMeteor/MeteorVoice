import type { AIProvider, ConversationMessage, ConversationContext, ConversationResponse } from './types'

const coachReplies: Record<string, string[]> = {
  interview: [
    'Good start. Tell me about yourself in two sentences.',
    'Nice. Try one answer using situation, action, and result.',
    'Good effort. Say it again with one confident pause.',
  ],
  travel: [
    'Great. You are checking in at a hotel; what do you say?',
    'Good. Now ask for directions politely.',
    'Nice job. Where would you like to go next?',
  ],
  'small-talk': [
    'Hi! How was your weekend?',
    'Good. Ask me one follow-up question.',
    'Nice. Try adding a short reaction.',
  ],
  restaurant: [
    'Good evening. Are you ready to order?',
    "Nice. Try ordering with \"I'd like\".",
    'Good. Ask about one special request.',
  ],
  workplace: [
    'Good. Give me a brief project update.',
    'Clear answer. What is your next step?',
    'Nice. Try disagreeing politely.',
  ],
}

const defaultReplies = [
  'Hi! What would you like to talk about?',
  'Good try. Say one more sentence.',
  "Nice. Let's continue with a new topic.",
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
      await sleep(80 + Math.random() * 140)
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
