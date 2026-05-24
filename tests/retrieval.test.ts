import { describe, it, expect } from 'vitest'
import {
  buildMixedChineseSpokenHint,
  findCommonCorrections,
  findCommonErrors,
  retrieveRelevantContext,
} from '@/lib/retrieval'

describe('retrieval', () => {
  it('returns scenario context for matching scenario', () => {
    const results = retrieveRelevantContext('Tell me about my experience', 'Job Interview')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].type).toBe('scenario')
    expect(results[0].content).toContain('Job Interview')
  })

  it('returns correction tips for interview keywords', () => {
    const results = retrieveRelevantContext('I collaborated with the team on', 'Job Interview')
    const tips = results.filter(r => r.type === 'correction_tip')
    expect(tips.length).toBeGreaterThan(0)
  })

  it('returns tips for travel scenario', () => {
    const results = retrieveRelevantContext('Where is the airport', 'Travel')
    expect(results.length).toBeGreaterThan(0)
    const tips = results.filter(r => r.type === 'correction_tip')
    expect(tips.length).toBeGreaterThan(0)
    expect(tips.some(t => t.content.toLowerCase().includes('polite'))).toBe(true)
  })

  it('detects common Chinese-English errors', () => {
    const tips = findCommonErrors('I want to order a coffee')
    expect(tips.length).toBeGreaterThan(0)
    expect(tips.some(t => t.includes('would like'))).toBe(true)
  })

  it('detects third-person singular errors', () => {
    const tips = findCommonErrors('he go to school every day')
    expect(tips.some(t => t.includes('Third-person singular'))).toBe(true)
  })

  it('detects past tense errors', () => {
    const tips = findCommonErrors('yesterday I go to the store')
    expect(tips.some(t => t.includes('Past tense'))).toBe(true)
  })

  it('returns empty for error-free text', () => {
    const tips = findCommonErrors('The weather is nice today')
    expect(tips).toEqual([])
  })

  it('builds fallback corrections for clear grammar errors', () => {
    const corrections = findCommonCorrections('I goes to school every day')
    expect(corrections.some(c => c.type === 'grammar' && c.suggestedText === 'I go')).toBe(true)
  })

  it('builds fallback corrections and spoken hint for mixed Chinese-English input', () => {
    const corrections = findCommonCorrections('I want to 预约 a table')
    expect(corrections.some(c => c.type === 'vocabulary' && c.originalText === '预约')).toBe(true)
    expect(buildMixedChineseSpokenHint('I want to 预约 a table')).toContain('reserve')
  })
})
