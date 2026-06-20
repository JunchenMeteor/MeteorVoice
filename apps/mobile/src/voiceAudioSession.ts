/**
 * iOS AVAudioSession management (Expo Module).
 * iOS 音频会话管理。
 */

import { requireOptionalNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'

export type VoiceAudioSessionMode = 'default' | 'playback' | 'recording' | 'voiceChat'

export interface ConfigureVoiceAudioSessionOptions {
  mode: VoiceAudioSessionMode
  allowBluetooth?: boolean
  defaultToSpeaker?: boolean
  mixWithOthers?: boolean
}

export interface ConfigureVoiceAudioSessionResult {
  ok: boolean
  platform: 'ios' | 'android'
  appliedMode: VoiceAudioSessionMode
  category?: string
  sessionMode?: string
  route?: {
    inputs: Array<{ portType: string; portName: string }>
    outputs: Array<{ portType: string; portName: string }>
  }
  message?: string
}

type VoiceAudioSessionNativeModule = {
  configure: (options: ConfigureVoiceAudioSessionOptions) => Promise<ConfigureVoiceAudioSessionResult>
}

function getNativeModule() {
  if (Platform.OS !== 'ios') return null
  return requireOptionalNativeModule<VoiceAudioSessionNativeModule>('VoiceAudioSession')
}

export const nativeAudioSessionFlags = {
  enableNativeVoiceChatSession: Platform.OS === 'ios',
}

export async function configureVoiceAudioSession(
  options: ConfigureVoiceAudioSessionOptions,
): Promise<ConfigureVoiceAudioSessionResult> {
  if (!nativeAudioSessionFlags.enableNativeVoiceChatSession || Platform.OS !== 'ios') {
    return {
      ok: false,
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      appliedMode: options.mode,
      message: 'Native voice audio session is disabled on this platform.',
    }
  }

  const nativeModule = getNativeModule()
  if (!nativeModule) {
    return {
      ok: false,
      platform: 'ios',
      appliedMode: options.mode,
      message: 'VoiceAudioSession native module is unavailable.',
    }
  }

  return nativeModule.configure(options)
}
