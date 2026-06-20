/**
 * TTS voice preference management. / TTS 音色偏好管理。
 */
export const ttsVoiceIdChangeEvent = 'meteorvoice-tts-voice-id-change'
export const ttsVoiceIdStorageKey = 'meteorvoice-tts-voice-id'

export function readTTSVoiceIdPreference() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ttsVoiceIdStorageKey)
}

export function writeTTSVoiceIdPreference(voiceId: string | null) {
  if (typeof window === 'undefined') return
  if (voiceId) {
    localStorage.setItem(ttsVoiceIdStorageKey, voiceId)
  } else {
    localStorage.removeItem(ttsVoiceIdStorageKey)
  }
  window.dispatchEvent(new CustomEvent(ttsVoiceIdChangeEvent, { detail: { voiceId } }))
}
