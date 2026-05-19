import { createClient } from '@/lib/supabase/server'

export type TTSProviderPreference = 'mock' | 'xunfei' | 'volcengine' | 'tencent'

export function normalizeTTSProvider(value?: string | null): TTSProviderPreference {
  if (value === 'xunfei' || value === 'volcengine' || value === 'tencent') return value
  return 'mock'
}

export async function getTTSProviderPreference() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'mock' as const

  const { data, error } = await supabase
    .from('theme_preferences')
    .select('tts_provider')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return normalizeTTSProvider(data?.tts_provider)
}

export async function setTTSProviderPreference(ttsProvider: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Unauthorized')
  }

  const normalized = normalizeTTSProvider(ttsProvider)
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
