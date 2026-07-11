/**
 * Session runtime utilities and constants.
 * 会话运行时工具与常量。
 */

export type Tab = 'session' | 'home' | 'history' | 'settings'
export type ApiBaseUrlSource = 'default' | 'user'
export type SessionSttProvider = 'native' | 'xunfei'
export type SessionRoutePresence = 'inSession' | 'outSession'

export type VoiceMetricEntry = {
  ts: number
  stage: string
  data: Record<string, unknown>
}

export type ASREvaluationRun = {
  startedAt?: number
  firstPartialMs?: number | null
  finalMs?: number | null
  chars?: number
  source?: string
  frameCount?: number
  totalBytes?: number
  error?: string
}

export type XunfeiSessionSttState = {
  socket: WebSocket | null
  subscriptions: {
    frame: { remove: () => void } | null
    state: { remove: () => void } | null
  }
  timers: {
    bootstrap: ReturnType<typeof setTimeout> | null
    finalize: ReturnType<typeof setTimeout> | null
    hard: ReturnType<typeof setTimeout> | null
    noFrame: ReturnType<typeof setTimeout> | null
    prewarmStale: ReturnType<typeof setTimeout> | null
    stopped: ReturnType<typeof setTimeout> | null
  }
  streamId: number
  generation: number
  prewarmed: boolean
  recordingStarted: boolean
  settled: boolean
  stopped: Promise<void>
  resolveStopped: () => void
  startRecording?: (context: string) => Promise<void>
}

export type ListeningGateSnapshot = {
  sessionActive: boolean
  routePresence: SessionRoutePresence
  canListenOnRoute: boolean
  busy: boolean
  playbackActive: boolean
  audioPlaying: boolean
  generation: number
  currentGeneration: number
}

export type PlaybackTailPrewarmSnapshot = {
  provider: SessionSttProvider
  isPlaying: boolean
  playbackActive: boolean
  audioUrl: string | null
  prewarmedAudioUrl: string | null
  playbackDurationSeconds: number | null | undefined
  playbackRemainingMs: number | null
}

export const STT_STOP_SETTLE_TIMEOUT_MS = 800
export const STT_MAX_CONSECUTIVE_RESTARTS = 5
export const STT_RESTART_DEBOUNCE_MS = 200
export const STT_PLAYBACK_PREWARM_MIN_DURATION_MS = 1800
export const STT_PLAYBACK_PREWARM_MIN_WINDOW_MS = 320
export const STT_PLAYBACK_PREWARM_MAX_WINDOW_MS = 900
export const STT_PREWARM_STALE_TIMEOUT_MS = 3500

export function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export async function settleWithTimeout(promise: Promise<void>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    await Promise.race([
      promise,
      new Promise<void>(resolve => {
        timeout = setTimeout(resolve, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function createStoppedSignal() {
  let resolveStopped: () => void = () => undefined
  const stopped = new Promise<void>(resolve => {
    resolveStopped = resolve
  })
  return { stopped, resolveStopped }
}

export function getPlaybackPrewarmWindowMs(durationSeconds: number | null | undefined) {
  if (!durationSeconds || !Number.isFinite(durationSeconds)) return 0
  const durationMs = durationSeconds * 1000
  if (durationMs < STT_PLAYBACK_PREWARM_MIN_DURATION_MS) return 0
  return Math.min(
    STT_PLAYBACK_PREWARM_MAX_WINDOW_MS,
    Math.max(STT_PLAYBACK_PREWARM_MIN_WINDOW_MS, Math.round(durationMs * 0.18)),
  )
}

export function canStartListening(snapshot: ListeningGateSnapshot) {
  return snapshot.sessionActive &&
    snapshot.routePresence === 'inSession' &&
    snapshot.canListenOnRoute &&
    !snapshot.busy &&
    !snapshot.playbackActive &&
    !snapshot.audioPlaying &&
    snapshot.generation === snapshot.currentGeneration
}

export function routePresenceForTab(tab: Tab): SessionRoutePresence {
  return tab === 'session' ? 'inSession' : 'outSession'
}

export function shouldConfirmScenarioSwitch(input: {
  currentScenarioKey: string
  nextScenarioKey: string
  sessionActive: boolean
}) {
  return input.sessionActive && input.currentScenarioKey !== input.nextScenarioKey
}

export function shouldResumeListening(input: {
  sessionActive: boolean
  routePresence?: SessionRoutePresence
  canListenOnRoute: boolean
  busy?: boolean
  playbackActive: boolean
  audioPlaying: boolean
  generation?: number
  currentGeneration?: number
}) {
  return input.sessionActive &&
    (input.routePresence == null || input.routePresence === 'inSession') &&
    input.canListenOnRoute &&
    !input.busy &&
    !input.playbackActive &&
    !input.audioPlaying &&
    (input.generation == null || input.currentGeneration == null || input.generation === input.currentGeneration)
}

export function getPlaybackTailPrewarmDecision(snapshot: PlaybackTailPrewarmSnapshot) {
  const windowMs = getPlaybackPrewarmWindowMs(snapshot.playbackDurationSeconds)
  const shouldPrewarm = snapshot.provider === 'xunfei' &&
    snapshot.isPlaying &&
    snapshot.playbackActive &&
    Boolean(snapshot.audioUrl) &&
    snapshot.prewarmedAudioUrl !== snapshot.audioUrl &&
    Boolean(windowMs) &&
    snapshot.playbackRemainingMs != null &&
    snapshot.playbackRemainingMs <= windowMs

  return {
    shouldPrewarm,
    windowMs,
    remainingMs: snapshot.playbackRemainingMs,
    durationMs: snapshot.playbackDurationSeconds && Number.isFinite(snapshot.playbackDurationSeconds)
      ? snapshot.playbackDurationSeconds * 1000
      : null,
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timer))
  })
}

export function enqueueRuntimeOperation<T>(options: {
  queue: Promise<unknown>
  label: string
  log: (stage: string, data?: Record<string, unknown>) => void
  operation: () => Promise<T>
}) {
  const startedAt = Date.now()
  const task = options.queue
    .catch(() => undefined)
    .then(async () => {
      options.log('stt_operation_start', { label: options.label })
      try {
        return await options.operation()
      } finally {
        options.log('stt_operation_done', {
          label: options.label,
          elapsedMs: Date.now() - startedAt,
        })
      }
    })

  return {
    task,
    queue: task.then(() => undefined, () => undefined),
  }
}

export function createASREvaluationReport(entries: VoiceMetricEntry[]) {
  const nativeRuns: ASREvaluationRun[] = []
  const remoteRuns: ASREvaluationRun[] = []
  let currentNative: ASREvaluationRun | null = null
  let currentRemote: ASREvaluationRun | null = null

  for (const entry of entries) {
    if (entry.stage === 'stt_start') {
      currentNative = { startedAt: entry.ts }
      nativeRuns.push(currentNative)
    } else if (entry.stage === 'stt_first_partial' && currentNative) {
      currentNative.firstPartialMs = readMetricNumber(entry.data.elapsedMs)
      currentNative.chars = readMetricNumber(entry.data.chars) ?? currentNative.chars
    } else if (entry.stage === 'stt_submit' && currentNative) {
      currentNative.finalMs = readMetricNumber(entry.data.elapsedMs)
      currentNative.chars = readMetricNumber(entry.data.chars) ?? currentNative.chars
      currentNative.source = typeof entry.data.source === 'string' ? entry.data.source : undefined
    } else if (entry.stage === 'stt_end' && currentNative && currentNative.finalMs == null) {
      currentNative.finalMs = readMetricNumber(entry.data.elapsedMs)
    }

    if (entry.stage === 'asr_stream_start') {
      currentRemote = { startedAt: entry.ts }
      remoteRuns.push(currentRemote)
    } else if (entry.stage === 'asr_first_partial' && currentRemote) {
      currentRemote.firstPartialMs = readMetricNumber(entry.data.elapsedMs)
      currentRemote.chars = readMetricNumber(entry.data.chars) ?? currentRemote.chars
    } else if (entry.stage === 'asr_stream_done' && currentRemote) {
      currentRemote.finalMs = readMetricNumber(entry.data.streamElapsedMs) ?? readMetricNumber(entry.data.elapsedMs)
      currentRemote.chars = readMetricNumber(entry.data.transcriptChars) ?? currentRemote.chars
      currentRemote.frameCount = readMetricNumber(entry.data.frameCount) ?? undefined
      currentRemote.totalBytes = readMetricNumber(entry.data.totalBytes) ?? undefined
    } else if (entry.stage === 'asr_stream_provider_error' && currentRemote) {
      currentRemote.error = typeof entry.data.message === 'string' ? entry.data.message : 'Provider error'
    } else if (entry.stage === 'asr_diagnostic_error' && currentRemote) {
      currentRemote.error = typeof entry.data.message === 'string' ? entry.data.message : 'Diagnostic error'
    }
  }

  const latestNative = nativeRuns.at(-1)
  const latestRemote = remoteRuns.at(-1)
  return [
    'ASR P4 evaluation report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Native runs: ${nativeRuns.length}`,
    formatASRRun('Latest native', latestNative),
    '',
    `Remote Xunfei runs: ${remoteRuns.length}`,
    formatASRRun('Latest remote', latestRemote),
    '',
    'Acceptance checks:',
    '- Compare first partial latency between native and remote.',
    '- Compare final latency between native and remote.',
    '- Compare transcript chars and exported raw metrics against the spoken script.',
    '- Do not switch production STT until remote accuracy and latency are better on device.',
  ].join('\n')
}

function formatASRRun(label: string, run: ASREvaluationRun | undefined) {
  if (!run) return `${label}: no run captured`
  return [
    `${label}:`,
    `  startedAt: ${run.startedAt ? new Date(run.startedAt).toLocaleString() : 'unknown'}`,
    `  firstPartialMs: ${formatMetricValue(run.firstPartialMs)}`,
    `  finalMs: ${formatMetricValue(run.finalMs)}`,
    `  chars: ${formatMetricValue(run.chars)}`,
    run.source ? `  source: ${run.source}` : null,
    run.frameCount != null ? `  frameCount: ${run.frameCount}` : null,
    run.totalBytes != null ? `  totalBytes: ${run.totalBytes}` : null,
    run.error ? `  error: ${run.error}` : null,
  ].filter(Boolean).join('\n')
}

function readMetricNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatMetricValue(value: number | null | undefined) {
  return value == null ? 'n/a' : String(value)
}
