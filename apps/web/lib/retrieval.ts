/**
 * Lightweight keyword retrieval for scenario packs and correction memory.
 * Provides relevant context to enrich AI prompts without a vector DB.
 */

import { scenarios } from './scenarios'
import type { CorrectionItem } from './providers/types'

interface RetrievalResult {
  type: 'scenario' | 'correction_tip'
  content: string
  score: number
}

export function retrieveRelevantContext(
  userMessage: string,
  currentScenario: string,
): RetrievalResult[] {
  const results: RetrievalResult[] = []
  const msg = userMessage.toLowerCase()
  const words = msg.split(/\s+/)

  // Match against scenario guidance
  const scenario = scenarios.find(s =>
    s.name.toLowerCase() === currentScenario.toLowerCase(),
  )
  if (scenario) {
    results.push({
      type: 'scenario',
      content: `Current scenario: ${scenario.name} — ${scenario.description}. Difficulty: ${scenario.difficulty}.`,
      score: 1.0,
    })
  }

  // Keyword-based scenario tips
  const scenarioTips: Record<string, string[]> = {
    interview: [
      'Use the STAR method (Situation, Task, Action, Result) for behavioral questions.',
      'Keep answers concise — 45-60 seconds per response.',
      'Use professional vocabulary: "spearheaded" instead of "led", "collaborated" instead of "worked with".',
    ],
    travel: [
      'Use polite forms: "Could you tell me..." instead of "Where is..."',
      'Learn key phrases: "I have a reservation", "What time does check-out start?"',
      'Practice numbers and times for schedules and payments.',
    ],
    'small-talk': [
      'Ask follow-up questions to keep conversation flowing.',
      'Use short reactions: "Oh, that sounds fun!" or "Really? Tell me more."',
      'Common topics: weather, weekend plans, hobbies, recent movies.',
    ],
    restaurant: [
      'Use "I\'d like" instead of "I want" — more polite in service situations.',
      'Practice ordering modifications: "Can I get that without onions?"',
      'Learn to ask about allergens and dietary restrictions politely.',
    ],
    workplace: [
      'Structure updates: achieved → in-progress → blockers → next steps.',
      'Disagree politely: "I see your point, but have we considered..."',
      'Use active voice in presentations: "We delivered" not "The project was delivered".',
    ],
  }

  const scenarioKey = scenario?.key ?? ''
  const tips = scenarioTips[scenarioKey] ?? []
  if (tips.length > 0) {
    // Find tips with keywords matching user message
    const matchedTips = tips
      .map(tip => ({ tip, score: words.filter(w => tip.toLowerCase().includes(w)).length / words.length }))
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)

    matchedTips.forEach(t => {
      results.push({ type: 'correction_tip', content: t.tip, score: t.score })
    })
  }

  return results.sort((a, b) => b.score - a.score)
}

// Common English mistakes by native Chinese speakers — used to enrich corrections
export const commonChineseErrors = [
  { pattern: /I (am )?go(es|ed)? to/, tip: 'Remember: "I go to" not "I goes to". Third-person singular only for he/she/it.' },
  { pattern: /he (go|come|eat|sleep)/, tip: 'Third-person singular: "he goes", "he comes", "he eats".' },
  { pattern: /yesterday.*(go|come|eat)/, tip: 'Past tense: "yesterday I went" not "yesterday I go".' },
  { pattern: /more \w+(er)/, tip: 'Watch double comparatives: "more better" → "better", "more faster" → "faster".' },
  { pattern: /I want to (order|make|ask)/, tip: '"I would like to" is more polite than "I want to" in service contexts.' },
]

const mixedChineseVocabulary: Record<string, string> = {
  预约: 'reserve / book',
  预订: 'reserve / book',
  点菜: 'order food',
  买单: 'pay the bill',
  结账: 'pay the bill / check out',
  退房: 'check out',
  面试: 'interview',
  工作: 'work / job',
  会议: 'meeting',
  项目: 'project',
  地址: 'address',
  机场: 'airport',
  酒店: 'hotel',
  餐厅: 'restaurant',
}

export function findCommonErrors(text: string): string[] {
  return commonChineseErrors
    .filter(e => e.pattern.test(text))
    .map(e => e.tip)
}

export function findCommonCorrections(text: string, locale: 'en' | 'zh' = 'en'): CorrectionItem[] {
  const corrections: CorrectionItem[] = []
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  const mixedChineseText = trimmed.match(/[\u3400-\u9fff]+/)?.[0]
  if (mixedChineseText) {
    corrections.push({
      type: 'vocabulary',
      originalText: mixedChineseText,
      suggestedText: mixedChineseVocabulary[mixedChineseText] ?? 'say this part in English',
      explanation: locale === 'zh'
        ? '练习英语时，可以把这段中文换成更自然的英文表达。'
        : 'When practicing English, replace the Chinese word or phrase with a natural English expression.',
      severity: 'minor',
    })
  }

  if (/\bi goes\b/i.test(trimmed)) {
    corrections.push({
      type: 'grammar',
      originalText: trimmed.match(/\bI goes\b/i)?.[0] ?? 'I goes',
      suggestedText: 'I go',
      explanation: 'Use the base verb after "I"; third-person singular -s is only for he, she, or it.',
      severity: 'minor',
    })
  }

  if (/\b(he|she|it) go\b/i.test(trimmed)) {
    const original = trimmed.match(/\b(he|she|it) go\b/i)?.[0] ?? 'he go'
    corrections.push({
      type: 'grammar',
      originalText: original,
      suggestedText: original.replace(/\bgo\b/i, 'goes'),
      explanation: 'Use "goes" with he, she, or it in the present tense.',
      severity: 'minor',
    })
  }

  if (/\byesterday\b.*\b(go|come|eat)\b/i.test(lower)) {
    corrections.push({
      type: 'grammar',
      originalText: trimmed,
      suggestedText: trimmed.replace(/\bgo\b/i, 'went').replace(/\bcome\b/i, 'came').replace(/\beat\b/i, 'ate'),
      explanation: 'Use past tense when talking about yesterday.',
      severity: 'moderate',
    })
  }

  if (/\bmore\s+(better|faster|easier|harder)\b/i.test(trimmed)) {
    const original = trimmed.match(/\bmore\s+(better|faster|easier|harder)\b/i)?.[0] ?? 'more better'
    corrections.push({
      type: 'grammar',
      originalText: original,
      suggestedText: original.replace(/^more\s+/i, ''),
      explanation: 'Do not use "more" with an adjective that is already comparative.',
      severity: 'minor',
    })
  }

  if (/\bI want to (order|make|ask|book|reserve)\b/i.test(trimmed)) {
    const original = trimmed.match(/\bI want to (order|make|ask|book|reserve)\b/i)?.[0] ?? 'I want to'
    corrections.push({
      type: 'fluency',
      originalText: original,
      suggestedText: original.replace(/^I want to/i, 'I would like to'),
      explanation: '"I would like to" sounds more natural and polite in service or practice conversations.',
      severity: 'minor',
    })
  }

  return corrections
}

export function buildMixedChineseSpokenHint(text: string, locale: 'en' | 'zh' = 'en') {
  const mixedChineseText = text.match(/[\u3400-\u9fff]+/)?.[0]
  if (!mixedChineseText) return null
  const suggestion = mixedChineseVocabulary[mixedChineseText] ?? 'say that part in English'
  if (locale === 'zh') return `“${mixedChineseText}” 可以用英语说成 “${suggestion}”。`
  return `You can say "${suggestion}" for "${mixedChineseText}".`
}
