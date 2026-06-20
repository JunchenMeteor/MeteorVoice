import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import * as SecureStore from 'expo-secure-store'
import { formatApiRequestError } from '@meteorvoice/api-client'
import { getPlaybackTailPrewarmDecision, type ApiBaseUrlSource, type SessionSttProvider } from '../sessionRuntime'

const apiBaseUrlStorageKey = 'api_base_url'
const sessionSttProviderStorageKey = 'session_stt_provider'

export interface SttProviderDeps {
  defaultApiBaseUrl: string
  api: {
    listASRProviders: () => Promise<{ providers: Array<{ key: string; enabled: boolean }> }>
  }
  authState: string
  sessionSttProvider: SessionSttProvider
  audio: {
    isPlaying: boolean
    playbackDurationSeconds: number
    playbackRemainingMs: number | null
  }
  audioUrl: string | null
  setApiBaseUrl: Dispatch<SetStateAction<string>>
  setApiBaseUrlSource: Dispatch<SetStateAction<ApiBaseUrlSource>>
  setSessionSttProvider: Dispatch<SetStateAction<SessionSttProvider>>
  setAvailableSessionSttProviders: Dispatch<SetStateAction<SessionSttProvider[]>>
  logVoiceMetric: (stage: string, data?: Record<string, unknown>) => void
  // Refs
  sessionSttProviderRef: React.MutableRefObject<SessionSttProvider>
  sessionSttProviderHydratedRef: React.MutableRefObject<boolean>
  sessionSttProvidersLoadedRef: React.MutableRefObject<boolean>
  playbackActiveRef: React.MutableRefObject<boolean>
  sttPrewarmAudioUrlRef: React.MutableRefObject<string | null>
  speechStartListeningRef: React.MutableRefObject<(lang?: string) => Promise<boolean>>
  speechCancelListeningRef: React.MutableRefObject<() => void | Promise<void>>
  startListeningWithProviderRef: React.MutableRefObject<(provider: SessionSttProvider, lang?: string) => Promise<boolean>>
  nativeSpeechStartListeningRef: React.MutableRefObject<(lang?: string) => Promise<boolean>>
}

export interface SttProviderReturn {
  updateApiBaseUrl: (value: string) => void
  resetApiBaseUrl: () => void
  setSessionSttProviderFn: (provider: SessionSttProvider) => void
  ensureSessionSttProviderForStart: () => Promise<SessionSttProvider>
  loadSessionSttProviders: () => Promise<void>
}

export function useSttProvider(deps: SttProviderDeps): SttProviderReturn {
  const {
    defaultApiBaseUrl, api, authState, sessionSttProvider, audio, audioUrl,
    setApiBaseUrl, setApiBaseUrlSource, setSessionSttProvider, setAvailableSessionSttProviders,
    logVoiceMetric,
    sessionSttProviderRef, sessionSttProviderHydratedRef, sessionSttProvidersLoadedRef,
    playbackActiveRef, sttPrewarmAudioUrlRef,
    speechStartListeningRef, speechCancelListeningRef, startListeningWithProviderRef,
    nativeSpeechStartListeningRef,
  } = deps

  const updateApiBaseUrl = useCallback((value: string) => {
    setApiBaseUrl(value)
    const normalized = value.trim()
    if (!normalized || normalized === defaultApiBaseUrl) {
      setApiBaseUrlSource('default')
      void SecureStore.deleteItemAsync(apiBaseUrlStorageKey)
      return
    }
    setApiBaseUrlSource('user')
    void SecureStore.setItemAsync(apiBaseUrlStorageKey, normalized)
  }, [defaultApiBaseUrl, setApiBaseUrl, setApiBaseUrlSource])

  const resetApiBaseUrl = useCallback(() => {
    setApiBaseUrl(defaultApiBaseUrl)
    setApiBaseUrlSource('default')
    void SecureStore.deleteItemAsync(apiBaseUrlStorageKey)
  }, [defaultApiBaseUrl, setApiBaseUrl, setApiBaseUrlSource])

  const setSessionSttProviderFn = useCallback((provider: SessionSttProvider) => {
    sessionSttProviderRef.current = provider
    setSessionSttProvider(provider)
    void SecureStore.setItemAsync(sessionSttProviderStorageKey, provider)
    logVoiceMetric('stt_provider_selected', { provider })
  }, [logVoiceMetric, sessionSttProviderRef, setSessionSttProvider])

  const ensureSessionSttProviderForStart = useCallback(async () => {
    let provider = sessionSttProviderRef.current

    if (!sessionSttProviderHydratedRef.current) {
      const stored = await SecureStore.getItemAsync(sessionSttProviderStorageKey)
      if (stored === 'xunfei' || stored === 'native') {
        provider = stored
        sessionSttProviderRef.current = stored
        setSessionSttProvider(stored)
      }
      sessionSttProviderHydratedRef.current = true
    }

    if (authState === 'signed-in' && !sessionSttProvidersLoadedRef.current) {
      try {
        const result = await api.listASRProviders()
        const providers: SessionSttProvider[] = ['native']
        if (result.providers.some(item => item.key === 'xunfei' && item.enabled)) {
          providers.push('xunfei')
        }
        setAvailableSessionSttProviders(providers)
        sessionSttProvidersLoadedRef.current = true
        if (!providers.includes(provider)) {
          provider = 'native'
          sessionSttProviderRef.current = 'native'
          setSessionSttProvider('native')
          void SecureStore.setItemAsync(sessionSttProviderStorageKey, 'native')
        }
      } catch (error) {
        const requestError = formatApiRequestError(error, {
          context: 'mobile_asr_providers_load', presentation: 'silent',
        })
        logVoiceMetric('mobile_silent_request_error', requestError.logData)
      }
    }

    return provider
  }, [
    api, authState, logVoiceMetric, sessionSttProviderHydratedRef,
    sessionSttProvidersLoadedRef, sessionSttProviderRef, setAvailableSessionSttProviders,
    setSessionSttProvider,
  ])

  // Swap speech refs when STT provider changes (stubs — real wiring in App.tsx)
  useEffect(() => {
    if (sessionSttProvider !== 'xunfei') {
      speechStartListeningRef.current = nativeSpeechStartListeningRef.current
      speechCancelListeningRef.current = () => undefined
    }
  }, [sessionSttProvider, speechStartListeningRef, speechCancelListeningRef, nativeSpeechStartListeningRef])

  const loadSessionSttProviders = useCallback(async () => {
    try {
      const result = await api.listASRProviders()
      const providers: SessionSttProvider[] = ['native']
      if (result.providers.some(p => p.key === 'xunfei' && p.enabled)) {
        providers.push('xunfei')
      }
      setAvailableSessionSttProviders(providers)
      if (!providers.includes(sessionSttProvider)) {
        sessionSttProviderRef.current = 'native'
        setSessionSttProvider('native')
        void SecureStore.setItemAsync(sessionSttProviderStorageKey, 'native')
      }
      sessionSttProvidersLoadedRef.current = true
    } catch (error) {
      const requestError = formatApiRequestError(error, {
        context: 'mobile_asr_providers_load', presentation: 'silent',
      })
      logVoiceMetric('mobile_silent_request_error', requestError.logData)
    }
  }, [api, logVoiceMetric, sessionSttProvider, sessionSttProviderRef, sessionSttProvidersLoadedRef, setAvailableSessionSttProviders, setSessionSttProvider])

  return {
    updateApiBaseUrl,
    resetApiBaseUrl,
    setSessionSttProviderFn,
    ensureSessionSttProviderForStart,
    loadSessionSttProviders,
  }
}
