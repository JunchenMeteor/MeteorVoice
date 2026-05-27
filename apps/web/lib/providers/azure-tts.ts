import type { TTSProvider, TTSResult } from './types'

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Azure TTS`)
  return value
}

// Maps MeteorVoice accent keys to Azure Neural voice names
function voiceForAccent(accent?: string): string {
  const normalized = accent?.toLowerCase() ?? ''
  if (normalized.includes('british')) return process.env.AZURE_TTS_VOICE_BRITISH || 'en-GB-SoniaNeural'
  if (normalized.includes('australian')) return process.env.AZURE_TTS_VOICE_AUSTRALIAN || 'en-AU-NatashaNeural'
  if (normalized.includes('indian')) return process.env.AZURE_TTS_VOICE_INDIAN || 'en-IN-NeerjaNeural'
  if (normalized.includes('singapore')) return process.env.AZURE_TTS_VOICE_SINGAPORE || 'en-SG-LunaNeural'
  if (normalized.includes('african')) return process.env.AZURE_TTS_VOICE_AFRICAN || 'en-ZA-LeahNeural'
  return process.env.AZURE_TTS_VOICE_AMERICAN || 'en-US-JennyNeural'
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
    async synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult> {
      const voice = voiceForAccent(options?.accent)
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
