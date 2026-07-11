/**
 * Mobile runtime scenario fallback. / 移动端运行时场景回退。
 */
import type { Scenario } from '@meteorvoice/shared'
import { scenarios } from '@meteorvoice/shared'

export function resolveRuntimeScenarios(remote: readonly Scenario[] | null | undefined): Scenario[] {
  return remote?.length ? [...remote] : scenarios
}
