import type { VoiceProfile } from '@meteorvoice/shared'

type AzureVoice = {
  accentKey: string
  displayName: string
  gender: 'male' | 'female'
  envKey: string
  fallbackVoiceId: string
}

const azureVoiceDefaults: AzureVoice[] = [
  { accentKey: 'american', displayName: 'Jenny', gender: 'female', envKey: 'AZURE_TTS_VOICE_AMERICAN', fallbackVoiceId: 'en-US-JennyNeural' },
  { accentKey: 'british', displayName: 'Sonia', gender: 'female', envKey: 'AZURE_TTS_VOICE_BRITISH', fallbackVoiceId: 'en-GB-SoniaNeural' },
  { accentKey: 'australian', displayName: 'Natasha', gender: 'female', envKey: 'AZURE_TTS_VOICE_AUSTRALIAN', fallbackVoiceId: 'en-AU-NatashaNeural' },
  { accentKey: 'indian', displayName: 'Neerja', gender: 'female', envKey: 'AZURE_TTS_VOICE_INDIAN', fallbackVoiceId: 'en-IN-NeerjaNeural' },
  { accentKey: 'singapore', displayName: 'Luna', gender: 'female', envKey: 'AZURE_TTS_VOICE_SINGAPORE', fallbackVoiceId: 'en-SG-LunaNeural' },
  { accentKey: 'african', displayName: 'Leah', gender: 'female', envKey: 'AZURE_TTS_VOICE_AFRICAN', fallbackVoiceId: 'en-ZA-LeahNeural' },
]

export function getAzureVoiceIdForAccent(accent?: string, env: Record<string, string | undefined> = process.env) {
  const normalized = accent?.toLowerCase() ?? ''
  const match = azureVoiceDefaults.find(voice => normalized.includes(voice.accentKey))
    ?? azureVoiceDefaults[0]
  return env[match.envKey]?.trim() || match.fallbackVoiceId
}

export function getAzureVoiceProfiles(
  available: boolean,
  env: Record<string, string | undefined> = process.env,
): VoiceProfile[] {
  return azureVoiceDefaults.map(voice => {
    const providerVoiceId = env[voice.envKey]?.trim() || voice.fallbackVoiceId
    return {
      id: `azure:${providerVoiceId}`,
      provider: 'azure',
      providerVoiceId,
      displayName: `${voice.displayName} (${providerVoiceId})`,
      locale: 'en',
      accentKey: voice.accentKey,
      gender: voice.gender,
      qualityTier: 'featured',
      status: available ? 'active' : 'unavailable',
    }
  })
}

export function isAzureVoiceId(value: string | null | undefined) {
  if (!value) return false
  return getAzureVoiceProfiles(true).some(profile => profile.providerVoiceId === value)
}
