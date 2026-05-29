import type { TTSProvider, TTSResult } from './types'
import { getAzureVoiceIdForAccent, isAzureVoiceId } from './azure-voices'

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Azure TTS`)
  return value
}

function resolveAzureVoice(accent?: string, voiceId?: string) {
  if (voiceId?.trim()) {
    const selected = voiceId.trim()
    if (!isAzureVoiceId(selected)) {
      throw new Error(`Unknown Azure voice "${selected}". Choose a configured Azure voice profile.`)
    }
    return selected
  }
  return getAzureVoiceIdForAccent(accent)
}

function speedToRate(speed?: number): string {
  if (!speed || speed === 0) return '+0%'
  const pct = Math.round(speed * 20)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

export function createAzureTTS(): TTSProvider {
  const key = requireEnv('AZURE_SPEECH_KEY')
  const region = requireEnv('AZURE_SPEECH_REGION')
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`

  return {
    async synthesize(text: string, options?: { accent?: string; speed?: number; voiceId?: string }): Promise<TTSResult> {
      const voice = resolveAzureVoice(options?.accent, options?.voiceId)
      const rate = speedToRate(options?.speed)
      const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${voice}"><prosody rate="${rate}">${text}</prosody></voice></speak>`

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        },
        body: ssml,
      })

      if (!response.ok) {
        throw new Error(`Azure TTS request failed: ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      return {
        audioUrl: `data:audio/mp3;base64,${base64}`,
        duration: text.length * 0.06,
      }
    },
  }
}
