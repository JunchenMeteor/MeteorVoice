/**
 * Runtime scenario configuration backed by Supabase. / Supabase 驱动的运行时场景配置。
 */
import type { Scenario } from '@meteorvoice/shared'
import { scenarios } from '@meteorvoice/shared'

import { createClient } from '@/lib/supabase/server'

export interface ScenarioRow {
  key: string
  name: string
  name_zh: string | null
  description: string | null
  description_zh: string | null
  difficulty: string
  icon: string | null
}

const legacyIcons: Record<string, string> = {
  briefcase: '💼',
  building: '🏢',
  coffee: '☕',
  plane: '✈️',
  utensils: '🍽️',
}

function normalizeDifficulty(value: string): Scenario['difficulty'] {
  if (value === 'intermediate' || value === 'advanced') return value
  return 'beginner'
}

export function mapScenarioRow(row: ScenarioRow): Scenario {
  const description = row.description?.trim() || row.name

  return {
    key: row.key,
    name: row.name,
    description,
    labels: {
      en: row.name,
      zh: row.name_zh?.trim() || row.name,
    },
    descriptions: {
      en: description,
      zh: row.description_zh?.trim() || description,
    },
    difficulty: normalizeDifficulty(row.difficulty),
    icon: legacyIcons[row.icon ?? ''] ?? (row.icon?.trim() || '💬'),
  }
}

export function resolveConfiguredScenarios(rows: ScenarioRow[] | null | undefined): Scenario[] {
  if (!rows?.length) return scenarios
  return rows.map(mapScenarioRow)
}

export async function listConfiguredScenarios(): Promise<Scenario[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return scenarios

  const { data, error } = await supabase
    .from('scenarios')
    .select('key,name,name_zh,description,description_zh,difficulty,icon')
    .eq('enabled', true)
    .order('created_at', { ascending: true })

  if (error) return scenarios
  return resolveConfiguredScenarios(data)
}
