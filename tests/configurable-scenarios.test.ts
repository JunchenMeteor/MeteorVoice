import { describe, expect, it } from 'vitest'

import {
  mapScenarioRow,
  resolveConfiguredScenarios,
} from '@/lib/server/scenarios'
import { scenarios } from '@meteorvoice/shared'
import { resolveRuntimeScenarios } from '../apps/mobile/src/runtimeScenarios'

const configuredRow = {
  key: 'business-trip',
  name: 'Business Trip',
  name_zh: '商务出差',
  description: 'Practice business travel conversations',
  description_zh: '练习商务出行对话',
  difficulty: 'intermediate',
  icon: 'briefcase',
}

describe('configurable scenarios', () => {
  it('maps Supabase rows into the shared scenario contract', () => {
    expect(mapScenarioRow(configuredRow)).toEqual({
      key: 'business-trip',
      name: 'Business Trip',
      description: 'Practice business travel conversations',
      labels: { en: 'Business Trip', zh: '商务出差' },
      descriptions: {
        en: 'Practice business travel conversations',
        zh: '练习商务出行对话',
      },
      difficulty: 'intermediate',
      icon: '💼',
    })
  })

  it('falls back to built-in scenarios when configuration is unavailable', () => {
    expect(resolveConfiguredScenarios(null)).toBe(scenarios)
    expect(resolveConfiguredScenarios([])).toBe(scenarios)
    expect(resolveRuntimeScenarios([])).toBe(scenarios)
  })

  it('keeps a non-empty remote scenario list for mobile screens', () => {
    const configured = resolveConfiguredScenarios([configuredRow])

    expect(resolveRuntimeScenarios(configured)).toEqual(configured)
  })
})
