export const ttsSpeedStorageKey = 'meteorvoice-tts-speed'
export const ttsSpeedChangeEvent = 'meteorvoice-tts-speed-change'
export const ttsSpeedOptions = [0.75, 0.9, 1, 1.2, 1.35, 1.5] as const

export type TTSSpeed = typeof ttsSpeedOptions[number]

export function normalizeTTSSpeed(value: unknown): TTSSpeed {
  const numeric = typeof value === 'number' ? value : Number(value)
  const nearest = ttsSpeedOptions.reduce((best, option) =>
    Math.abs(option - numeric) < Math.abs(best - numeric) ? option : best,
  ttsSpeedOptions[2])
  return nearest
}

export function readTTSSpeedPreference(): TTSSpeed {
  if (typeof window === 'undefined') return 1
  return normalizeTTSSpeed(localStorage.getItem(ttsSpeedStorageKey))
}

export function writeTTSSpeedPreference(speed: TTSSpeed) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ttsSpeedStorageKey, String(speed))
  window.dispatchEvent(new CustomEvent(ttsSpeedChangeEvent, { detail: { speed } }))
}
