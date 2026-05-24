import { describe, expect, it } from 'vitest'
import { normalizeTTSSpeed, ttsSpeedOptions } from '@/lib/tts-speed'
import { getTTSSpeedRouting } from '@meteorvoice/shared'

describe('tts speed preferences', () => {
  it('uses the normal speed option by default', () => {
    expect(normalizeTTSSpeed(undefined)).toBe(1)
    expect(normalizeTTSSpeed('not-a-number')).toBe(1)
  })

  it('snaps arbitrary values to the nearest supported speed', () => {
    expect(normalizeTTSSpeed(0.74)).toBe(0.75)
    expect(normalizeTTSSpeed(0.91)).toBe(0.9)
    expect(normalizeTTSSpeed(1.16)).toBe(1.2)
    expect(normalizeTTSSpeed(1.44)).toBe(1.5)
  })

  it('keeps the speed slider to calibrated practical steps', () => {
    expect(ttsSpeedOptions).toEqual([0.75, 0.9, 1, 1.2, 1.35, 1.5])
  })

  it('maps Xunfei speeds conservatively to avoid clipped starts', () => {
    expect(getTTSSpeedRouting('xunfei', 0.75)).toEqual({ serverSpeed: 50, playbackRate: 1 })
    expect(getTTSSpeedRouting('xunfei', 1)).toEqual({ serverSpeed: 55, playbackRate: 1 })
    expect(getTTSSpeedRouting('xunfei', 1.5)).toEqual({ serverSpeed: 80, playbackRate: 1 })
  })
})
