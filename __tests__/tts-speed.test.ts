import { describe, expect, it } from 'vitest'
import { normalizeTTSSpeed, ttsSpeedOptions } from '@/lib/tts-speed'

describe('tts speed preferences', () => {
  it('uses the normal speed option by default', () => {
    expect(normalizeTTSSpeed(undefined)).toBe(1)
    expect(normalizeTTSSpeed('not-a-number')).toBe(1)
  })

  it('snaps arbitrary values to the nearest supported speed', () => {
    expect(normalizeTTSSpeed(0.74)).toBe(0.75)
    expect(normalizeTTSSpeed(0.91)).toBe(0.85)
    expect(normalizeTTSSpeed(1.16)).toBe(1.2)
  })

  it('keeps the speed slider to five practical steps', () => {
    expect(ttsSpeedOptions).toEqual([0.75, 0.85, 1, 1.1, 1.2])
  })
})
