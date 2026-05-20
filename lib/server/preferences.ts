import { createClient } from '@/lib/supabase/server'

export type TTSProviderPreference = 'mock' | 'xunfei' | 'volcengine' | 'tencent'

export function normalizeTTSProvider(value?: string | null): TTSProviderPreference {
  if (value === 'xunfei' || value === 'volcengine' || value === 'tencent') return value
  return 'mock'
}

export function resolveTTSProviderPreference(storedValue?: string | null) {
  const fallback = normalizeTTSProvider(process.env.TTS_PROVIDER)
  const stored = normalizeTTSProvider(storedValue)

  if (!storedValue) return fallback
  if (stored === 'mock' && fallback !== 'mock') return fallback
  return stored
}

export function getAvailableProviders(): TTSProviderPreference[] {
  const providers: TTSProviderPreference[] = ['mock']
  if (process.env.XUNFEI_APP_ID && process.env.XUNFEI_API_KEY && process.env.XUNFEI_API_SECRET) {
    providers.push('xunfei')
  }
  if (process.env.VOLCENGINE_TTS_APP_ID && process.env.VOLCENGINE_TTS_ACCESS_TOKEN) {
    providers.push('volcengine')
  }
  if (process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY) {
    providers.push('tencent')
  }
  return providers
}

export async function getTTSProviderPreference() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return resolveTTSProviderPreference()

  const { data, error } = await supabase
    .from('theme_preferences')
    .select('tts_provider')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return resolveTTSProviderPreference(data?.tts_provider)
}

export async function setTTSProviderPreference(ttsProvider: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Unauthorized')
  }

  const normalized = normalizeTTSProvider(ttsProvider)
  const available = getAvailableProviders()
  if (!available.includes(normalized)) {
    throw new Error(`TTS provider "${normalized}" is not configured`)
  }
  const { error } = await supabase
    .from('theme_preferences')
    .upsert({
      user_id: user.id,
      tts_provider: normalized,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw error
  return normalized
}
