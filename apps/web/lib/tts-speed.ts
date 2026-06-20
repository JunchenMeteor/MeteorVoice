/**
 * TTS speed preference management. / TTS 语速偏好管理。
 */
export const ttsSpeedStorageKey = 'meteorvoice-tts-speed'
export const ttsSpeedChangeEvent = 'meteorvoice-tts-speed-change'
export const ttsSpeedOptions = [0.75, 0.9, 1, 1.2, 1.35, 1.5] as const

export type TTSSpeed = typeof ttsSpeedOptions[number]

const pendingPrefSyncKey = 'meteorvoice-pending-pref-sync'

function getPendingSyncKeys(): string[] {
  try {
    const raw = localStorage.getItem(pendingPrefSyncKey)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function addPendingSyncKey(key: string) {
  const keys = getPendingSyncKeys()
  if (!keys.includes(key)) {
    keys.push(key)
    localStorage.setItem(pendingPrefSyncKey, JSON.stringify(keys))
  }
}

function clearPendingSyncKeys() {
  localStorage.removeItem(pendingPrefSyncKey)
}

async function flushPendingPreferences() {
  const keys = getPendingSyncKeys()
  if (keys.length === 0) return

  try {
    const body: Record<string, unknown> = {}
    for (const key of keys) {
      const raw = localStorage.getItem(`meteorvoice-pref-${key}`)
      if (raw !== null) {
        body[key] = key === 'tts_speed' ? Number(raw) : raw
      }
    }
    if (Object.keys(body).length === 0) {
      clearPendingSyncKeys()
      return
    }
    const res = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-web' },
      body: JSON.stringify(body),
    })
    if (res.ok) clearPendingSyncKeys()
  } catch {
    // 静默失败，下次 sync 时重试
  }
}

function cachePrefLocally(key: string, value: string) {
  localStorage.setItem(`meteorvoice-pref-${key}`, value)
}

export async function persistPreference(key: string, value: string | number) {
  if (typeof window === 'undefined') return

  cachePrefLocally(key, String(value))

  try {
    const res = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-web' },
      body: JSON.stringify({ [key]: value }),
    })
    if (res.ok) {
      await flushPendingPreferences()
    } else {
      addPendingSyncKey(key)
    }
  } catch {
    addPendingSyncKey(key)
  }
}

export function normalizeTTSSpeed(value: unknown): TTSSpeed {
  const numeric = typeof value === 'number' ? value : Number(value)
  const nearest = ttsSpeedOptions.reduce((best, option) =>
    Math.abs(option - numeric) < Math.abs(best - numeric) ? option : best,
    ttsSpeedOptions[2],
  )
  return nearest
}

export function readTTSSpeedPreference(): TTSSpeed {
  if (typeof window === 'undefined') return 1
  const raw = localStorage.getItem(ttsSpeedStorageKey)
  if (raw !== null) {
    const local = normalizeTTSSpeed(raw)
    // 异步从 API 拉取最新值覆盖本地（如果 API 值不同）
    void fetch('/api/preferences', {
      headers: { 'X-MeteorVoice-Client': 'meteorvoice-web' },
    })
      .then(res => res.json())
      .then((data: { tts_speed?: number }) => {
        if (typeof data.tts_speed === 'number') {
          const serverSpeed = normalizeTTSSpeed(data.tts_speed)
          if (serverSpeed !== readTTSSpeedPreference()) {
            localStorage.setItem(ttsSpeedStorageKey, String(serverSpeed))
            window.dispatchEvent(new CustomEvent(ttsSpeedChangeEvent, { detail: { speed: serverSpeed } }))
          }
        }
      })
      .catch(() => {})
    return local
  }
  return 1
}

export async function persistTTSSpeedPreference(speed: TTSSpeed) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ttsSpeedStorageKey, String(speed))
  window.dispatchEvent(new CustomEvent(ttsSpeedChangeEvent, { detail: { speed } }))
  await persistPreference('tts_speed', speed)
}

export function writeTTSSpeedPreference(speed: TTSSpeed) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ttsSpeedStorageKey, String(speed))
  window.dispatchEvent(new CustomEvent(ttsSpeedChangeEvent, { detail: { speed } }))
}

export { flushPendingPreferences }
