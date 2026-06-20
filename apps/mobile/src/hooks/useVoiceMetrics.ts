/* eslint-disable react-hooks/immutability */
import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  canStartListening,
  createASREvaluationReport,
  enqueueRuntimeOperation,
  type SessionRoutePresence,
  type VoiceMetricEntry,
} from '../sessionRuntime'
import { DEFAULT_PLAYBACK_COOLDOWN_MS } from '@meteorvoice/session-core'
import type { SessionSttProvider } from '../sessionRuntime'

export interface VoiceMetricsRefs {
  snapshotRef: React.MutableRefObject<{ sessionId: string; state: string }>
  sessionGenerationRef: React.MutableRefObject<number>
  turnRequestRef: React.MutableRefObject<number>
  endpointRequestRef: React.MutableRefObject<number>
  activeTabRef: React.MutableRefObject<string>
  sessionActiveRef: React.MutableRefObject<boolean>
  canListenOnRouteRef: React.MutableRefObject<boolean>
  busyRef: React.MutableRefObject<boolean>
  playbackActiveRef: React.MutableRefObject<boolean>
  audioPlayingRef: React.MutableRefObject<boolean>
  sessionSttProviderRef: React.MutableRefObject<SessionSttProvider>
  selectedScenarioKeyRef: React.MutableRefObject<string>
  statusRef: React.MutableRefObject<string>
  listeningTeardownRef: React.MutableRefObject<Promise<void> | null>
  sttOperationQueueRef: React.MutableRefObject<Promise<unknown>>
  xunfeiSessionSttRef: React.MutableRefObject<{ streamId: number } | null>
  routePresenceRef: React.MutableRefObject<SessionRoutePresence>
  resumeListeningTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  listeningStartMsRef: React.MutableRefObject<number>
}

export interface VoiceMetricsReturn {
  voiceMetrics: VoiceMetricEntry[]
  voiceMetricsText: string
  asrEvaluationText: string
  logVoiceMetric: (stage: string, data?: Record<string, unknown>) => void
  logUserAction: (action: string, data?: Record<string, unknown>) => void
  setStatus: (nextStatus: string) => void
  setBusy: (nextBusy: boolean) => void
  setRoutePresence: (next: SessionRoutePresence, reason: string) => void
  canStartSessionListening: (context: string, generation?: number) => boolean
  enqueueSttOperation: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  runListeningTeardown: (reason: string, action: () => void | Promise<void>) => Promise<void>
  waitForListeningTeardown: (context: string) => Promise<void>
  cancelListeningForReason: (reason: string) => Promise<void>
  scheduleResumeListening: (delayMs?: number, updateStatus?: boolean) => void
  clearResumeListeningTimer: () => void
  listeningStartupStatus: (provider?: SessionSttProvider) => string
  voiceMetricSeqRef: React.MutableRefObject<number>
  clearVoiceMetrics: () => void
}

export function useVoiceMetrics(
  refs: VoiceMetricsRefs,
  setStatusState: Dispatch<SetStateAction<string>>,
  setBusyState: Dispatch<SetStateAction<boolean>>,
  speechCancelListeningRef: React.MutableRefObject<() => void | Promise<void>>,
  speechStartListeningRef: React.MutableRefObject<(lang?: string) => Promise<boolean>>,
): VoiceMetricsReturn {
  const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetricEntry[]>([])
  const voiceMetricSeqRef = useRef(0)

  const listeningStartupStatus = useCallback((provider?: SessionSttProvider) => {
    const p = provider ?? refs.sessionSttProviderRef.current
    return p === 'xunfei'
      ? 'session.status.preparing_listening'
      : 'session.status.listening'
  }, [refs.sessionSttProviderRef])

  const logVoiceMetric = useCallback((stage: string, data: Record<string, unknown> = {}) => {
    const metricSeq = ++voiceMetricSeqRef.current
    const snapshot = refs.snapshotRef.current
    const stream = refs.xunfeiSessionSttRef.current
    const generation = refs.sessionGenerationRef.current
    const turnRequestId = refs.turnRequestRef.current
    const sessionId = snapshot.sessionId
    const context = {
      traceId: `${sessionId}:g${generation}:t${turnRequestId}`,
      metricSeq,
      sessionId,
      generation,
      streamId: stream?.streamId ?? null,
      turnRequestId,
      endpointRequestId: refs.endpointRequestRef.current,
      activeTab: refs.activeTabRef.current,
      routePresence: refs.routePresenceRef.current,
      status: refs.statusRef.current,
      workflowState: snapshot.state,
      scenario: refs.selectedScenarioKeyRef.current,
      sessionActive: refs.sessionActiveRef.current,
      canListenOnRoute: refs.canListenOnRouteRef.current,
      busy: refs.busyRef.current,
      playbackActive: refs.playbackActiveRef.current,
      audioPlaying: refs.audioPlayingRef.current,
      sttProvider: refs.sessionSttProviderRef.current,
    }
    const sanitizedData = Object.fromEntries(
      Object.entries({ ...context, ...data }).map(([key, value]) => [
        key,
        key.toLowerCase().includes('audiourl') && typeof value === 'string' ? '<audioUrl>' : value,
      ]),
    )
    const entry = { ts: Date.now(), stage, data: sanitizedData }
    console.info('[voice-metrics]', JSON.stringify(entry))
    setVoiceMetrics(previous => [...previous.slice(-239), entry])
  }, [refs])

  const setStatus = useCallback((nextStatus: string) => {
    const previous = refs.statusRef.current
    refs.statusRef.current = nextStatus
    if (previous !== nextStatus) {
      logVoiceMetric('ui_status_changed', { from: previous, to: nextStatus })
    }
    setStatusState(nextStatus)
  }, [logVoiceMetric, refs.statusRef, setStatusState])

  const setBusy = useCallback((nextBusy: boolean) => {
    const previous = refs.busyRef.current
    refs.busyRef.current = nextBusy
    if (previous !== nextBusy) {
      logVoiceMetric('ui_busy_changed', { from: previous, to: nextBusy })
    }
    setBusyState(nextBusy)
  }, [logVoiceMetric, refs.busyRef, setBusyState])

  const logUserAction = useCallback((action: string, data: Record<string, unknown> = {}) => {
    logVoiceMetric('user_action', {
      action,
      activeTab: refs.activeTabRef.current,
      scenario: refs.selectedScenarioKeyRef.current,
      sessionActive: refs.sessionActiveRef.current,
      canListenOnRoute: refs.canListenOnRouteRef.current,
      busy: refs.busyRef.current,
      playbackActive: refs.playbackActiveRef.current,
      audioPlaying: refs.audioPlayingRef.current,
      sttProvider: refs.sessionSttProviderRef.current,
      pendingTeardown: Boolean(refs.listeningTeardownRef.current),
      ...data,
    })
  }, [logVoiceMetric, refs])

  const setRoutePresence = useCallback((next: SessionRoutePresence, reason: string) => {
    const previous = refs.routePresenceRef.current
    refs.routePresenceRef.current = next
    refs.canListenOnRouteRef.current = next === 'inSession'
    if (previous !== next) {
      logVoiceMetric('route_presence_changed', {
        from: previous, to: next, reason,
        activeTab: refs.activeTabRef.current,
        sessionActive: refs.sessionActiveRef.current,
      })
    }
  }, [logVoiceMetric, refs])

  const canStartSessionListening = useCallback((context: string, generation?: number) => {
    const gen = generation ?? refs.sessionGenerationRef.current
    const gate = {
      sessionActive: refs.sessionActiveRef.current,
      routePresence: refs.routePresenceRef.current,
      canListenOnRoute: refs.canListenOnRouteRef.current,
      busy: refs.busyRef.current,
      playbackActive: refs.playbackActiveRef.current,
      audioPlaying: refs.audioPlayingRef.current,
      generation: gen,
      currentGeneration: refs.sessionGenerationRef.current,
    }
    const allowed = canStartListening(gate)
    if (!allowed) {
      logVoiceMetric('stt_start_aborted', { context, ...gate })
    }
    return allowed
  }, [logVoiceMetric, refs])

  const enqueueSttOperation = useCallback(<T,>(label: string, operation: () => Promise<T>) => {
    const { task, queue } = enqueueRuntimeOperation({
      queue: refs.sttOperationQueueRef.current,
      label,
      log: logVoiceMetric,
      operation,
    })
    refs.sttOperationQueueRef.current = queue
    return task
  }, [logVoiceMetric, refs.sttOperationQueueRef])

  const runListeningTeardown = useCallback((reason: string, action: () => void | Promise<void>) => {
    const startedAt = Date.now()
    logVoiceMetric('listening_teardown_start', {
      reason,
      provider: refs.sessionSttProviderRef.current,
      activeTab: refs.activeTabRef.current,
      sessionActive: refs.sessionActiveRef.current,
      canListenOnRoute: refs.canListenOnRouteRef.current,
    })
    const task = Promise.resolve()
      .then(action)
      .catch(error => {
        logVoiceMetric('listening_teardown_error', {
          reason,
          message: error instanceof Error ? error.message : 'Listening teardown failed',
        })
      })
      .finally(() => {
        if (refs.listeningTeardownRef.current === task) {
          refs.listeningTeardownRef.current = null
        }
        logVoiceMetric('listening_teardown_done', { reason, elapsedMs: Date.now() - startedAt })
      })
    refs.listeningTeardownRef.current = task
    return task
  }, [logVoiceMetric, refs])

  const waitForListeningTeardown = useCallback(async (context: string) => {
    const pending = refs.listeningTeardownRef.current
    if (!pending) return
    const startedAt = Date.now()
    logVoiceMetric('listening_teardown_wait', { context })
    await pending
    logVoiceMetric('listening_teardown_wait_done', { context, elapsedMs: Date.now() - startedAt })
  }, [logVoiceMetric, refs.listeningTeardownRef])

  const cancelListeningForReason = useCallback((reason: string) => (
    runListeningTeardown(reason, async () => {
      await speechCancelListeningRef.current()
    })
  ), [runListeningTeardown, speechCancelListeningRef])

  const voiceMetricsText = useMemo(() => {
    return voiceMetrics
      .map(entry => `${new Date(entry.ts).toLocaleTimeString()} ${entry.stage} ${JSON.stringify(entry.data)}`)
      .join('\n')
  }, [voiceMetrics])

  const asrEvaluationText = useMemo(() => createASREvaluationReport(voiceMetrics), [voiceMetrics])

  const clearResumeListeningTimer = useCallback(() => {
    if (!refs.resumeListeningTimerRef.current) return
    clearTimeout(refs.resumeListeningTimerRef.current)
    refs.resumeListeningTimerRef.current = null
  }, [refs.resumeListeningTimerRef])

  const scheduleResumeListening = useCallback((delayMs = DEFAULT_PLAYBACK_COOLDOWN_MS, updateStatus = true) => {
    clearResumeListeningTimer()
    refs.resumeListeningTimerRef.current = setTimeout(() => {
      refs.resumeListeningTimerRef.current = null
      if (!canStartSessionListening('resume_timer')) {
        logVoiceMetric('resume_listening_skipped', {
          routePresence: refs.routePresenceRef.current,
          playbackActive: refs.playbackActiveRef.current,
          audioPlaying: refs.audioPlayingRef.current,
        })
        return
      }
      refs.listeningStartMsRef.current = Date.now()
      if (updateStatus) setStatus(listeningStartupStatus())
      void speechStartListeningRef.current('en-US')
    }, delayMs)
  }, [canStartSessionListening, clearResumeListeningTimer, listeningStartupStatus, logVoiceMetric, setStatus, refs, speechStartListeningRef])

  const clearVoiceMetrics = useCallback(() => {
    setVoiceMetrics([])
  }, [])

  return {
    voiceMetrics,
    voiceMetricsText,
    asrEvaluationText,
    logVoiceMetric,
    logUserAction,
    setStatus,
    setBusy,
    setRoutePresence,
    canStartSessionListening,
    enqueueSttOperation,
    runListeningTeardown,
    waitForListeningTeardown,
    cancelListeningForReason,
    scheduleResumeListening,
    clearResumeListeningTimer,
    listeningStartupStatus,
    voiceMetricSeqRef,
    clearVoiceMetrics,
  }
}
