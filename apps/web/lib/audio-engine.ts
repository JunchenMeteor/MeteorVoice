/**
 * Web Audio API engine for playback and recording. / Web Audio API 播放和录音引擎。
 */
export type AudioLevelStop = () => void

export type AudioLevelSource = {
  analyser: AnalyserNode
  audioContext: AudioContext
  stopSource?: () => void
  closeOnStop?: boolean
}

export type PlaybackAudioNodes = {
  audioContext: AudioContext
  analyser: AnalyserNode
  source: MediaElementAudioSourceNode
}

export class PlaybackBlockedError extends Error {
  constructor(readonly audioUrl: string) {
    super('Audio playback requires a user gesture')
    this.name = 'PlaybackBlockedError'
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

export const silentAudioUrl = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA=='

export function sampleAudioLevel(source: AudioLevelSource, onLevel: (level: number | null) => void): AudioLevelStop {
  const data = new Uint8Array(source.analyser.fftSize)
  let frame = 0
  let stopped = false

  function tick() {
    if (stopped) return
    source.analyser.getByteTimeDomainData(data)
    let sum = 0
    for (const value of data) {
      const centered = (value - 128) / 128
      sum += centered * centered
    }
    const rms = Math.sqrt(sum / data.length)
    onLevel(Math.min(1, rms * 4.2))
    frame = window.requestAnimationFrame(tick)
  }

  frame = window.requestAnimationFrame(tick)

  return () => {
    if (stopped) return
    stopped = true
    window.cancelAnimationFrame(frame)
    source.stopSource?.()
    onLevel(null)
    if (source.closeOnStop !== false) {
      void source.audioContext.close().catch(() => {})
    }
  }
}

export async function createMicLevelSampler(onLevel: (level: number | null) => void): Promise<AudioLevelStop | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null

  try {
    const permissions = navigator.permissions
    if (!permissions?.query) return null
    const status = await permissions.query({ name: 'microphone' as PermissionName })
    if (status.state !== 'granted') return null
  } catch {
    return null
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
    if (!AudioContextCtor) {
      stream.getTracks().forEach(track => track.stop())
      return null
    }

    const audioContext = new AudioContextCtor()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.72
    const source = audioContext.createMediaStreamSource(stream)
    source.connect(analyser)

    return sampleAudioLevel({
      analyser,
      audioContext,
      stopSource: () => stream.getTracks().forEach(track => track.stop()),
    }, onLevel)
  } catch {
    onLevel(null)
    return null
  }
}

export function getPlaybackLevelSource(
  audio: HTMLAudioElement,
  nodesRef: { current: PlaybackAudioNodes | null },
  onLevel: (level: number | null) => void,
): AudioLevelSource | null {
  try {
    if (!nodesRef.current) {
      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
      if (!AudioContextCtor) return null
      const audioContext = new AudioContextCtor()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      const source = audioContext.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(audioContext.destination)
      nodesRef.current = { audioContext, analyser, source }
    }
    void nodesRef.current.audioContext.resume().catch(() => {})
    return {
      analyser: nodesRef.current.analyser,
      audioContext: nodesRef.current.audioContext,
      closeOnStop: false,
    }
  } catch {
    onLevel(null)
    return null
  }
}

export function normalizePlaybackRate(speed?: number) {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return 1
  return Math.min(1.6, Math.max(0.5, speed))
}

export function isCoarsePointerDevice() {
  if (typeof window === 'undefined') return false
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches)
}

export function getPlaybackStartDelayMs() {
  return isCoarsePointerDevice() ? 120 : 0
}

export function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

export function encodeWavWithSilence(audioBuffer: AudioBuffer, silenceSeconds: number) {
  const channels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const silenceFrames = Math.ceil(sampleRate * silenceSeconds)
  const totalFrames = silenceFrames + audioBuffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = totalFrames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const channelData = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index))
  let offset = 44
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const sourceFrame = frame - silenceFrames
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = sourceFrame < 0 ? 0 : channelData[channel][sourceFrame] ?? 0
      const clamped = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
      offset += bytesPerSample
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export async function addSilencePreroll(blob: Blob, silenceSeconds: number) {
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
  if (!AudioContextCtor) return blob

  const audioContext = new AudioContextCtor()
  try {
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer())
    return encodeWavWithSilence(audioBuffer, silenceSeconds)
  } finally {
    void audioContext.close().catch(() => {})
  }
}

export async function createPlayableAudioUrl(audioUrl: string) {
  if (!audioUrl.startsWith('data:audio/')) return { url: audioUrl, revoke: null as (() => void) | null }

  const response = await fetch(audioUrl)
  const blob = await response.blob()
  const playableBlob = isCoarsePointerDevice()
    ? await addSilencePreroll(blob, 0.18).catch(() => blob)
    : blob
  const objectUrl = URL.createObjectURL(playableBlob)
  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  }
}

export function playAudioToEnd(
  audioUrl: string,
  options?: {
    audio?: HTMLAudioElement
    playbackNodesRef?: { current: PlaybackAudioNodes | null }
    onLevel?: (level: number | null) => void
    speed?: number
  },
) {
  return new Promise<void>((resolve, reject) => {
    const audio = options?.audio ?? new Audio()
    const playbackRate = normalizePlaybackRate(options?.speed)
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.playbackRate = playbackRate
    audio.setAttribute('playsinline', 'true')
    let settled = false
    let timeout: number | null = null
    let startTimeout: number | null = null
    let stopLevelSampler: AudioLevelStop | null = null
    let revokePlayableUrl: (() => void) | null = null
    let playbackStarted = false

    function cleanup() {
      audio.onended = null
      audio.onerror = null
      audio.onloadedmetadata = null
      audio.onloadeddata = null
      audio.oncanplay = null
      stopLevelSampler?.()
      stopLevelSampler = null
      if (timeout) {
        window.clearTimeout(timeout)
        timeout = null
      }
      if (startTimeout) {
        window.clearTimeout(startTimeout)
        startTimeout = null
      }
      revokePlayableUrl?.()
      revokePlayableUrl = null
    }

    function settle(callback: () => void) {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    function armTimeout(ms: number) {
      if (timeout) window.clearTimeout(timeout)
      timeout = window.setTimeout(() => settle(resolve), ms)
    }

    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        armTimeout((audio.duration * 1000 / playbackRate) + 2000)
      }
    }
    audio.onended = () => settle(resolve)
    audio.onerror = () => settle(() => reject(new Error('Audio playback failed')))

    function startPlayback() {
      if (playbackStarted || settled) return
      playbackStarted = true
      const delayMs = getPlaybackStartDelayMs()
      startTimeout = window.setTimeout(() => {
        startTimeout = null
        try {
          audio.currentTime = 0
        } catch {}
        audio.play().catch(error => {
          if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
            settle(() => reject(new PlaybackBlockedError(audioUrl)))
            return
          }
          settle(() => reject(error))
        })
      }, delayMs)
    }

    audio.onloadeddata = startPlayback
    audio.oncanplay = startPlayback
    armTimeout(45000)
    if (options?.onLevel && options.playbackNodesRef) {
      const levelSource = getPlaybackLevelSource(audio, options.playbackNodesRef, options.onLevel)
      if (levelSource) {
        stopLevelSampler = sampleAudioLevel(levelSource, options.onLevel)
      }
    }

    void createPlayableAudioUrl(audioUrl)
      .then(playable => {
        if (settled) {
          playable.revoke?.()
          return
        }
        revokePlayableUrl = playable.revoke
        audio.src = playable.url
        audio.load()
      })
      .catch(error => {
        settle(() => reject(error))
      })
  })
}
