/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
/**
 * useXunfeiStt — Xunfei ASR WebSocket Engine
 *
 * Manages the complete lifecycle of a Xunfei streaming ASR session:
 *   create session → open WebSocket → start PCM capture → stream frames
 *   → receive partial/final results → cleanup
 *
 * @deps
 *   api, auth            — network / auth
 *   logMetric, setStatus — logging / UI
 *   enqueueSttOperation, canStartSessionListening — STT queue / gate
 *   locale, selectedScenarioKey — session context
 *   snapshotRef, sessionGenerationRef, sttStreamIdRef, ... — mutable refs
 *   sessionActiveRef, routePresenceRef, ... — session state refs
 *   nativeSpeechStartListeningRef, nativeSpeechCancelListeningRef — fallback
 *   finalTranscriptHandlerRef, endedWithoutTranscriptHandlerRef — ref bridges to orchestration
 *
 * @returns
 *   xunfeiSessionSttRef          — current session state (socket, timers, subscriptions)
 *   startXunfeiSessionListening  — start or prewarm a Xunfei session
 *   cancelXunfeiSessionListening — cleanly tear down
 */
import { useCallback, useRef } from 'react'
import {
  createStoppedSignal,
  delay,
  settleWithTimeout,
  STT_PREWARM_STALE_TIMEOUT_MS,
  STT_RESTART_DEBOUNCE_MS,
  STT_STOP_SETTLE_TIMEOUT_MS,
} from '../sessionRuntime'
import {
  addPcmFrameListener,
  addPcmStateListener,
  isPcmCaptureAvailable,
  startPcmCapture,
  stopPcmCapture,
  type PcmCaptureFrameEvent,
} from '../voicePcmCapture'
import {
  createXunfeiASRFrame,
  extractXunfeiRecognitionResult,
  getObject,
  parseJsonObject,
} from '../xunfeiAsrWire'
import type { CreateASRSessionResponse } from '@meteorvoice/api-client'

interface XunfeiSttDeps {
  api: any
  auth: { state: string; refreshSession: () => Promise<boolean> }
  logMetric: (stage: string, data?: Record<string, unknown>) => void
  setStatus: (status: string) => void
  enqueueSttOperation: <T>(label: string, op: () => Promise<T>) => Promise<T>
  canStartSessionListening: (context: string, generation?: number) => boolean
  locale: string
  selectedScenarioKey: string
  snapshotRef: React.MutableRefObject<{ sessionId: string }>
  sessionGenerationRef: React.MutableRefObject<number>
  sttStreamIdRef: React.MutableRefObject<number>
  sttRestartCountRef: React.MutableRefObject<number>
  sttRestartStartMsRef: React.MutableRefObject<number>
  listeningStartMsRef: React.MutableRefObject<number>
  sessionActiveRef: React.MutableRefObject<boolean>
  routePresenceRef: React.MutableRefObject<string>
  canListenOnRouteRef: React.MutableRefObject<boolean>
  playbackActiveRef: React.MutableRefObject<boolean>
  audioPlayingRef: React.MutableRefObject<boolean>
  nativeSpeechStartListeningRef: React.MutableRefObject<(lang?: string) => Promise<boolean>>
  nativeSpeechCancelListeningRef: React.MutableRefObject<() => void | Promise<void>>
  finalTranscriptHandlerRef: React.MutableRefObject<(t: string) => Promise<void>>
  endedWithoutTranscriptHandlerRef: React.MutableRefObject<() => void>
}

export function useXunfeiStt(deps: XunfeiSttDeps) {
  const {
    api, auth, logMetric, setStatus, enqueueSttOperation, canStartSessionListening,
    locale, selectedScenarioKey, snapshotRef,
    sessionGenerationRef, sttStreamIdRef, sttRestartCountRef, sttRestartStartMsRef,
    listeningStartMsRef,
    sessionActiveRef, routePresenceRef, canListenOnRouteRef,
    playbackActiveRef, audioPlayingRef,
    nativeSpeechStartListeningRef, nativeSpeechCancelListeningRef,
    finalTranscriptHandlerRef, endedWithoutTranscriptHandlerRef,
  } = deps

  const xunfeiSessionSttRef = useRef<any>(null)

  const cancelXunfeiSessionListening = useCallback(async (reason = 'cancel') => {
    await enqueueSttOperation(`stop:${reason}`, async () => {
      const current = xunfeiSessionSttRef.current
      if (!current) return
      if (current.settled) {
        await settleWithTimeout(current.stopped, STT_STOP_SETTLE_TIMEOUT_MS)
        return
      }
      current.settled = true
      if (current.finalizeTimer) clearTimeout(current.finalizeTimer)
      if (current.hardTimer) clearTimeout(current.hardTimer)
      if (current.noFrameTimer) clearTimeout(current.noFrameTimer)
      if (current.stoppedTimer) clearTimeout(current.stoppedTimer)
      current.frameSubscription?.remove()
      current.stateSubscription?.remove()
      if (current.socket && current.socket.readyState === WebSocket.OPEN) current.socket.close()
      await stopPcmCapture(`session_${reason}`).catch(() => undefined)
      current.resolveStopped?.()
      if (xunfeiSessionSttRef.current === current) xunfeiSessionSttRef.current = null
      await settleWithTimeout(current.stopped, STT_STOP_SETTLE_TIMEOUT_MS)
    })
  }, [enqueueSttOperation])

  const startXunfeiSessionListening = useCallback(async (prewarm = false) => {
    return enqueueSttOperation(prewarm ? 'prewarm:xunfei' : 'start:xunfei', async () => {
      const generation = sessionGenerationRef.current
      const streamId = ++sttStreamIdRef.current
      let recordingStarted = false

      const canUseXunfeiRoute = (context: string) => {
        const allowed = prewarm && !recordingStarted
          ? sessionActiveRef.current && routePresenceRef.current === 'inSession' && canListenOnRouteRef.current &&
            generation === sessionGenerationRef.current && playbackActiveRef.current && audioPlayingRef.current
          : canStartSessionListening(context, generation)
        if (!allowed) logMetric('stt_stream_aborted', { provider: 'xunfei', context, streamId, generation, prewarm })
        return allowed
      }

      if (!prewarm && !canUseXunfeiRoute('entry')) return false
      if (prewarm && (!sessionActiveRef.current || routePresenceRef.current !== 'inSession' || !playbackActiveRef.current)) return false

      const existing = xunfeiSessionSttRef.current
      if (existing && !existing.settled && !prewarm && existing.prewarmed && !existing.recordingStarted && existing.startRecording) {
        await existing.startRecording('consume_prewarm')
        return true
      }
      if (existing && !existing.settled) return true
      if (existing) await settleWithTimeout(existing.stopped, STT_STOP_SETTLE_TIMEOUT_MS)
      await delay(STT_RESTART_DEBOUNCE_MS)
      if (!canUseXunfeiRoute('after_restart_debounce')) return false
      if (!isPcmCaptureAvailable()) return nativeSpeechStartListeningRef.current('en-US')
      if (auth.state !== 'signed-in') return nativeSpeechStartListeningRef.current('en-US')

      let socket: WebSocket | null = null
      let frameSubscription: { remove: () => void } | null = null as { remove: () => void } | null
      let stateSubscription: { remove: () => void } | null = null as { remove: () => void } | null
      let finalizeTimer: ReturnType<typeof setTimeout> | null = null
      let hardTimer: ReturnType<typeof setTimeout> | null = null
      let noFrameTimer: ReturnType<typeof setTimeout> | null = null
      let stoppedTimer: ReturnType<typeof setTimeout> | null = null
      let prewarmStaleTimer: ReturnType<typeof setTimeout> | null = null
      let bootstrapTimer: ReturnType<typeof setTimeout> | null = null
      let settled = false
      let firstFrame = true
      let finalFrameSent = false
      let finalReceived = false
      let audioSequence = 0
      let frameCount = 0
      let totalBytes = 0
      let transcript = ''
      let firstPartialAt: number | null = null
      const transcriptSegments: string[] = []
      const stoppedSignal = createStoppedSignal()
      let bootstrappedSession: CreateASRSessionResponse | null = null
      let finishAudio: (() => void) | null = null

      const isCurrentStream = (context: string) => {
        const current = xunfeiSessionSttRef.current
        return current && current.streamId === streamId && generation === sessionGenerationRef.current
      }

      const updateCurrent = () => {
        xunfeiSessionSttRef.current = {
          streamId, socket, frameSubscription, stateSubscription,
          finalizeTimer, hardTimer, noFrameTimer, stoppedTimer,
          generation, prewarmed: prewarm, recordingStarted, settled,
          stopped: stoppedSignal.stopped, resolveStopped: stoppedSignal.resolveStopped,
        } as any
      }

      const settle = (reason: string, submitted: boolean) => {
        if (settled) return
        settled = true; updateCurrent()
        if (bootstrapTimer) { clearTimeout(bootstrapTimer); bootstrapTimer = null }
        if (finalizeTimer) clearTimeout(finalizeTimer)
        if (hardTimer) clearTimeout(hardTimer)
        if (noFrameTimer) clearTimeout(noFrameTimer)
        if (stoppedTimer) clearTimeout(stoppedTimer)
        if (prewarmStaleTimer) clearTimeout(prewarmStaleTimer)
        frameSubscription?.remove()
        void stopPcmCapture(`session_${reason}`).catch(() => undefined).finally(() => {
          stateSubscription?.remove(); stoppedSignal.resolveStopped()
        })
        if (socket && socket.readyState === WebSocket.OPEN) socket.close()
        stoppedTimer = setTimeout(() => stoppedSignal.resolveStopped(), STT_STOP_SETTLE_TIMEOUT_MS)
        if (xunfeiSessionSttRef.current && xunfeiSessionSttRef.current.streamId === streamId) {
          xunfeiSessionSttRef.current = null
        }
        logMetric('stt_end', { provider: 'xunfei', cancelled: reason !== 'final', reason, streamId, generation, frameCount, totalBytes })
      }

      try {
        const authReady = await auth.refreshSession()
        if (!canUseXunfeiRoute('after_auth_refresh')) return false
        if (!authReady) return nativeSpeechStartListeningRef.current('en-US')

        const session = await api.createASRSession({
          provider: 'xunfei', mode: 'streaming',
          languageMode: locale === 'zh' ? 'mixed_zh_en' : 'english',
          scenarioKey: selectedScenarioKey,
          sessionId: snapshotRef.current.sessionId,
          endpointSilenceMs: 900,
          clientTraceId: `mobile-session-${Date.now()}`,
        })

        if (!canUseXunfeiRoute('after_session_create')) return false
        if (session.provider !== 'xunfei' || session.status !== 'created' || session.transport !== 'websocket' || !session.endpointUrl) {
          return nativeSpeechStartListeningRef.current('en-US')
        }
        bootstrappedSession = session
        setStatus('session.status.preparing_listening')
        await nativeSpeechCancelListeningRef.current()

        bootstrapTimer = setTimeout(() => {
          if (!settled) { settle('bootstrap_timeout', false); void nativeSpeechStartListeningRef.current('en-US') }
        }, 10_000)

        socket = new WebSocket(session.endpointUrl)
        updateCurrent()

        // PCM state listener — diagnostic logging
        stateSubscription = addPcmStateListener(event => {
          if (!isCurrentStream('pcm_state')) return
          logMetric('stt_pcm_state', {
            provider: 'xunfei', state: event.state,
            frameCount: event.frameCount, totalBytes: event.totalBytes,
            message: event.message,
          })
        })

        // PCM frame listener — streams microphone audio to Xunfei WebSocket
        frameSubscription = addPcmFrameListener((event: PcmCaptureFrameEvent) => {
          if (!isCurrentStream('pcm_frame')) return
          if (!canUseXunfeiRoute('pcm_frame')) { settle('route_inactive', false); return }
          if (!socket || socket.readyState !== WebSocket.OPEN || finalFrameSent) return
          frameCount += 1
          totalBytes += event.byteCount
          if (frameCount === 1) {
            if (noFrameTimer) { clearTimeout(noFrameTimer); noFrameTimer = null }
          }
          sendAudioFrame(firstFrame ? 0 : 1, event.audioBase64)
          firstFrame = false
          if (frameCount === 1 || frameCount % 50 === 0) {
            logMetric('stt_pcm_frame', {
              provider: 'xunfei', frameCount, totalBytes, elapsedMs: event.elapsedMs,
            })
          }
        })

        const sendAudioFrame = (status: 0 | 1 | 2, audioBase64: string) => {
          if (!socket || socket.readyState !== WebSocket.OPEN || finalFrameSent) return
          if (status === 2) finalFrameSent = true
          audioSequence += 1
          socket.send(JSON.stringify(createXunfeiASRFrame(session, status, audioBase64, audioSequence)))
        }

        finishAudio = () => {
          if (!isCurrentStream('finish_audio')) { settle('route_inactive', false); return }
          if (finalFrameSent) return
          sendAudioFrame(2, '')
          void stopPcmCapture('session_endpoint').catch(() => undefined)
        }

        socket.onopen = () => {
          if (!isCurrentStream('socket_open')) return
          if (!canUseXunfeiRoute('socket_open')) { settle('route_inactive', false); return }
          if (prewarm) {
            prewarmStaleTimer = setTimeout(() => {
              if (settled || recordingStarted) return
              settle('prewarm_expired', false)
            }, STT_PREWARM_STALE_TIMEOUT_MS)
            updateCurrent()
            return
          }
          const startStreamingPcm = async (context: string) => {
            if (recordingStarted || settled) return
            if (!bootstrappedSession) { settle('missing_session', false); return }
            if (!isCurrentStream(`start_pcm:${context}`)) return
            if (!canUseXunfeiRoute(`start_pcm:${context}`)) { settle('route_inactive', false); return }
            if (prewarmStaleTimer) { clearTimeout(prewarmStaleTimer); prewarmStaleTimer = null }
            recordingStarted = true; updateCurrent()
            try {
              const pcmStatus = await startPcmCapture({ sampleRate: bootstrappedSession.providerConfig?.sampleRate ?? 16000, frameDurationMs: bootstrappedSession.providerConfig?.frameIntervalMs ?? 40 })
              if (!isCurrentStream(`after_pcm_start:${context}`)) return
              if (!canUseXunfeiRoute(`after_pcm_start:${context}`)) { void stopPcmCapture('session_route_inactive').catch(() => undefined); settle('route_inactive', false); return }
              listeningStartMsRef.current = Date.now()
              if (bootstrapTimer) { clearTimeout(bootstrapTimer); bootstrapTimer = null }
              setStatus('session.status.listening')
              if (!hardTimer && finishAudio) hardTimer = setTimeout(finishAudio, 15_000)
              noFrameTimer = setTimeout(() => {
                if (settled || frameCount > 0) return
                settle('pcm_no_frame', false)
                endedWithoutTranscriptHandlerRef.current()
              }, 1800)
              updateCurrent()
            } catch { settle('pcm_error', false); endedWithoutTranscriptHandlerRef.current() }
          }
          void startStreamingPcm('socket_open')
          if (!hardTimer && finishAudio) hardTimer = setTimeout(finishAudio, 15_000)
          updateCurrent()
        }

        socket.onmessage = event => {
          if (!isCurrentStream('socket_message')) return
          const payload = parseJsonObject(event.data)
          const header = getObject(payload?.header)
          const code = typeof header?.code === 'number' ? header.code : typeof payload?.code === 'number' ? payload.code : 0
          if (code !== 0) { settle('provider_error', false); endedWithoutTranscriptHandlerRef.current(); return }

          const recognitionResult = extractXunfeiRecognitionResult(payload)
          if (recognitionResult?.text) {
            if (recognitionResult.pgs === 'rpl' && recognitionResult.rg) {
              const [start, end] = recognitionResult.rg
              for (let i = start; i <= end; i++) transcriptSegments[i] = ''
            }
            if (recognitionResult.sn != null) transcriptSegments[recognitionResult.sn] = recognitionResult.text
            else transcriptSegments.push(recognitionResult.text)
            transcript = transcriptSegments.filter(Boolean).join('').trim()
            if (!firstPartialAt) firstPartialAt = Date.now()
            if (finalizeTimer) clearTimeout(finalizeTimer)
            finalizeTimer = setTimeout(finishAudio!, session.providerConfig?.eosMs ?? 900)
            updateCurrent()
          }

          const data = getObject(payload?.data)
          const wsStatus = typeof header?.status === 'number' ? header.status : typeof data?.status === 'number' ? data.status : undefined
          if (wsStatus === 2) {
            finalReceived = true
            const normalized = transcript.trim()
            if (normalized) {
              sttRestartCountRef.current = 0; sttRestartStartMsRef.current = 0
              void finalTranscriptHandlerRef.current(normalized)
              settle('final', true)
            } else { settle('final', false); endedWithoutTranscriptHandlerRef.current() }
          }
        }

        socket.onerror = () => { if (isCurrentStream('socket_error')) { settle('socket_error', false); endedWithoutTranscriptHandlerRef.current() } }

        socket.onclose = event => {
          if (!isCurrentStream('socket_close')) return
          if (!finalReceived && !settled) { settle('socket_closed', false); endedWithoutTranscriptHandlerRef.current() }
        }
        updateCurrent()
        return true
      } catch (error) {
        logMetric('stt_provider_error', { provider: 'xunfei', message: error instanceof Error ? error.message : 'Xunfei STT failed to start' })
        settle('start_error', false)
        return nativeSpeechStartListeningRef.current('en-US')
      }
    })
  }, [
    api, auth, canStartSessionListening, enqueueSttOperation, locale, logMetric,
    selectedScenarioKey, setStatus, snapshotRef,
    sessionGenerationRef, sttStreamIdRef, sttRestartCountRef, sttRestartStartMsRef,
    listeningStartMsRef,
    sessionActiveRef, routePresenceRef, canListenOnRouteRef,
    playbackActiveRef, audioPlayingRef,
    nativeSpeechStartListeningRef, nativeSpeechCancelListeningRef,
    finalTranscriptHandlerRef, endedWithoutTranscriptHandlerRef,
  ])

  return { xunfeiSessionSttRef, startXunfeiSessionListening, cancelXunfeiSessionListening }
}
