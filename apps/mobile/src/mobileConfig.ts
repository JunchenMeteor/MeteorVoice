import Constants from 'expo-constants'
import { Platform } from 'react-native'

type ExpoExtra = {
  apiBaseUrl?: string
  apiBaseUrlPreview?: string
}

type ExpoConfigWithVersions = {
  version?: string
  ios?: {
    buildNumber?: string
  }
  android?: {
    versionCode?: number
  }
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

export function getDisplayAppVersion() {
  const constants = Constants as typeof Constants & {
    nativeAppVersion?: string | null
    nativeBuildVersion?: string | null
  }
  const expoConfig = Constants.expoConfig as ExpoConfigWithVersions | null
  const appVersion = constants.nativeAppVersion ?? expoConfig?.version
  const buildVersion = constants.nativeBuildVersion
    ?? (Platform.OS === 'android' ? expoConfig?.android?.versionCode?.toString() : expoConfig?.ios?.buildNumber)

  if (appVersion && buildVersion) return `${appVersion} (${buildVersion})`
  return appVersion ?? buildVersion ?? 'unknown'
}
