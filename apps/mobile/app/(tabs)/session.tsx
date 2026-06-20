/**
 * Session tab — voice practice screen.
 * 会话标签页 — 语音练习界面。
 */

import { useMemo } from 'react'

import {
  accentProfiles,
  getAccentLabel,
  getAccentRegion,
  getDifficultyLabel,
  getScenarioDescription,
  getScenarioLabel,
  scenarios,
} from '@meteorvoice/shared'

import { SessionScreen } from '../../src/screens/SessionScreen'
import { useSession } from '../../src/SessionContext'

export default function SessionTab() {
  const { tr, locale, selectedScenarioKey, selectedAccentKey, voiceProfileAccentLabel, voiceProfileAccentRegion } = useSession()

  const { scenario, accent } = useMemo(() => {
    const s = scenarios.find(x => x.key === selectedScenarioKey) ?? scenarios[0]
    const a = accentProfiles.find(x => x.key === selectedAccentKey) ?? accentProfiles[0]
    return { scenario: s, accent: a }
  }, [selectedScenarioKey, selectedAccentKey])

  return (
    <SessionScreen
      tr={tr}
      scenarioName={getScenarioLabel(scenario, locale)}
      scenarioIcon={scenario.icon}
      scenarioDifficulty={getDifficultyLabel(scenario.difficulty, locale)}
      scenarioDescription={getScenarioDescription(scenario, locale)}
      accentName={voiceProfileAccentLabel ?? getAccentLabel(accent, locale)}
      accentRegion={voiceProfileAccentRegion ?? getAccentRegion(accent, locale)}
    />
  )
}
