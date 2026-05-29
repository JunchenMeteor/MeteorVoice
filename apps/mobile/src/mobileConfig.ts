import Constants from 'expo-constants'

type ExpoExtra = {
  apiBaseUrl?: string
  apiBaseUrlPreview?: string
}

const localApiBaseUrl = 'http://localhost:3000'

function getExpoExtra(): ExpoExtra {
  return (Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {}) as ExpoExtra
}

export function getDefaultApiBaseUrl() {
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()
  if (explicit) return explicit

  const extra = getExpoExtra()
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return extra.apiBaseUrlPreview ?? extra.apiBaseUrl ?? localApiBaseUrl
  }

  return extra.apiBaseUrl ?? extra.apiBaseUrlPreview ?? localApiBaseUrl
}
