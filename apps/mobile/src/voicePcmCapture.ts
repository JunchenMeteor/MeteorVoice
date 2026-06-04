import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core'
import { Platform } from 'react-native'

export type PcmCaptureOptions = {
  sampleRate?: number
  frameDurationMs?: number
}

export type PcmCaptureStatus = {
  isCapturing: boolean
  sampleRate: number
  channels: number
  bitDepth: number
  frameDurationMs: number
  frameSizeBytes: number
  frameCount: number
  totalBytes: number
  elapsedMs: number
  reason?: string
}

export type PcmCaptureFrameEvent = {
  sequence: number
  timestampMs: number
  elapsedMs: number
  audioBase64: string
  byteCount: number
  sampleRate: number
  channels: number
  bitDepth: number
  durationMs: number
}

export type PcmCaptureStateEvent = PcmCaptureStatus & {
  state: 'started' | 'stopped' | 'error' | 'restarting' | 'restarted' | 'interrupted'
  message?: string
}

type VoicePcmCaptureNativeModule = {
  start: (options: PcmCaptureOptions) => Promise<PcmCaptureStatus>
  stop: (reason?: string) => Promise<PcmCaptureStatus>
  getStatus: () => Promise<PcmCaptureStatus>
  addListener: (
    eventName: 'onPcmCaptureFrame' | 'onPcmCaptureState',
    listener: (event: PcmCaptureFrameEvent | PcmCaptureStateEvent) => void,
  ) => EventSubscription
}

function getNativeModule() {
  if (Platform.OS !== 'ios') return null
  return requireOptionalNativeModule<VoicePcmCaptureNativeModule>('VoicePcmCapture')
}

export function isPcmCaptureAvailable() {
  return Boolean(getNativeModule())
}

export async function startPcmCapture(options: PcmCaptureOptions = {}) {
  const nativeModule = getNativeModule()
  if (!nativeModule) {
    throw new Error('VoicePcmCapture native module is unavailable.')
  }
  return nativeModule.start({
    sampleRate: options.sampleRate ?? 16000,
    frameDurationMs: options.frameDurationMs ?? 40,
  })
}

export async function stopPcmCapture(reason = 'manual') {
  const nativeModule = getNativeModule()
  if (!nativeModule) {
    throw new Error('VoicePcmCapture native module is unavailable.')
  }
  return nativeModule.stop(reason)
}

export async function getPcmCaptureStatus() {
  const nativeModule = getNativeModule()
  if (!nativeModule) {
    throw new Error('VoicePcmCapture native module is unavailable.')
  }
  return nativeModule.getStatus()
}

export function addPcmFrameListener(listener: (event: PcmCaptureFrameEvent) => void) {
  const nativeModule = getNativeModule()
  if (!nativeModule) return { remove() {} } as EventSubscription
  return nativeModule.addListener('onPcmCaptureFrame', event => {
    listener(event as PcmCaptureFrameEvent)
  })
}

export function addPcmStateListener(listener: (event: PcmCaptureStateEvent) => void) {
  const nativeModule = getNativeModule()
  if (!nativeModule) return { remove() {} } as EventSubscription
  return nativeModule.addListener('onPcmCaptureState', event => {
    listener(event as PcmCaptureStateEvent)
  })
}
