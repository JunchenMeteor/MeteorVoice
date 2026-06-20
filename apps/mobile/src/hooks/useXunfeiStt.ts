import { useCallback, useRef } from 'react'
import {
  STT_PREWARM_STALE_TIMEOUT_MS,
  STT_RESTART_DEBOUNCE_MS,
  STT_STOP_SETTLE_TIMEOUT_MS,
  createStoppedSignal,
  delay,
  settleWithTimeout,
  type SessionSttProvider,
  type XunfeiSessionSttState,
} from '../sessionRuntime'
import { createXunfeiASRFrame, extractXunfeiRecognitionResult, getObject, parseJsonObject } from '../xunfeiAsrWire'
import { addPcmFrameListener, addPcmStateListener, isPcmCaptureAvailable, startPcmCapture, stopPcmCapture, type PcmCaptureFrameEvent } from '../voicePcmCapture'
import type { CreateASRSessionResponse } from '@meteorvoice/api-client'

export interface XunfeiSttDeps {
  api: {
    createASRSession: (params: Record<string, unknown>) => Promise<CreateASRSessionResponse>
  }
  auth: {
    state: string
    refreshSession: () => Promise<boolean>
  }
  availableSessionSttProviders: SessionSttProvider[]
  scenarioKey: string
  localeRef: React.MutableRefObject<string>
  snapshotRef: React.MutableRefObject<{ sessionId: string }>
  sessionGenerationRef: React.MutableRefObject<number>
  sessionActiveRef: React.MutableRefObject<boolean>
  canStartSessionListening: (context: string, generation?: number) => boolean
  enqueueSttOperation: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  logVoiceMetric: (stage: string, data?: Record<string, unknown>) => void
  setStatus: (status: string) => void
  handleListeningEndedWithoutTranscript: () => void
  handleNativeFinalTranscript: (finalTranscript: string) => Promise<void>
  nativeSpeechStartListeningRef: React.MutableRefObject<(lang?: string) => Promise<boolean>>
  nativeSpeechCancelListeningRef: React.MutableRefObject<() => void | Promise<void>>
  routePresenceRef: React.MutableRefObject<string>
  canListenOnRouteRef: React.MutableRefObject<boolean>
  playbackActiveRef: React.MutableRefObject<boolean>
  audioPlayingRef: React.MutableRefObject<boolean>
  listeningStartMsRef: React.MutableRefObject<number>
  sttStreamIdRef: React.MutableRefObject<number>
  sttRestartCountRef: React.MutableRefObject<number>
  sttRestartStartMsRef: React.MutableRefObject<number>
  sttOperationQueueRef: React.MutableRefObject<Promise<unknown>>
}

export interface XunfeiSttReturn {
  xunfeiSessionSttRef: React.MutableRefObject<XunfeiSessionSttState | null>
  startXunfeiSessionListening: (prewarm?: boolean) => Promise<unknown>
  cancelXunfeiSessionListening: (reason?: string) => Promise<void>
}

export function useXunfeiStt(deps: XunfeiSttDeps): XunfeiSttReturn {
  const {
    api, auth, availableSessionSttProviders, scenarioKey,
    localeRef, snapshotRef, sessionGenerationRef, sessionActiveRef,
    canStartSessionListening, enqueueSttOperation, logVoiceMetric, setStatus,
    handleListeningEndedWithoutTranscript, handleNativeFinalTranscript,
    nativeSpeechStartListeningRef, nativeSpeechCancelListeningRef,
    routePresenceRef, canListenOnRouteRef,
    playbackActiveRef, audioPlayingRef, listeningStartMsRef,
    sttStreamIdRef, sttRestartCountRef, sttRestartStartMsRef,
  } = deps

  const xunfeiSessionSttRef = useRef<XunfeiSessionSttState | null>(null)

  const cancelXunfeiSessionListening = useCallback(async (reason = 'cancel') => {
    await enqueueSttOperation(`stop:${reason}`, async () => {
      const current = xunfeiSessionSttRef.current
      if (!current) {
        logVoiceMetric('stt_stop_noop', { provider: 'xunfei', reason })
        return
      }
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
      if (current.socket && current.socket.readyState === WebSocket.OPEN) {
        current.socket.close()
      }
      await stopPcmCapture(`session_${reason}`).catch(() => undefined)
      current.resolveStopped()
      if (xunfeiSessionSttRef.current?.streamId === current.streamId) {
        xunfeiSessionSttRef.current = null
      }
      await settleWithTimeout(current.stopped, STT_STOP_SETTLE_TIMEOUT_MS)
      logVoiceMetric('stt_end', {
        provider: 'xunfei', cancelled: true, reason,
        streamId: current.streamId, generation: current.generation,
      })
    })
  }, [enqueueSttOperation, logVoiceMetric])

  const startXunfeiSessionListening = useCallback(async (prewarm = false) => {
    return enqueueSttOperation(prewarm ? 'prewarm:xunfei' : 'start:xunfei', async () => {
      const generation = sessionGenerationRef.current
      const streamId = ++sttStreamIdRef.current
      let recordingStarted = false

      const canUseXunfeiRoute = (context: string) => {
        const allowed = prewarm && !recordingStarted
          ? sessionActiveRef.current &&
            routePresenceRef.current === 'inSession' &&
            canListenOnRouteRef.current &&
            generation === sessionGenerationRef.current &&
            playbackActiveRef.current &&
            audioPlayingRef.current
          : canStartSessionListening(context, generation)
        if (!allowed) {
          logVoiceMetric('stt_stream_aborted', {
            provider: 'xunfei', context, streamId, generation,
            currentGeneration: sessionGenerationRef.current,
            routePresence: routePresenceRef.current, prewarm,
          })
        }
        return allowed
      }

      if (!prewarm && !canUseXunfeiRoute('entry')) return false
      if (prewarm && (!sessionActiveRef.current || routePresenceRef.current !== 'inSession' || !playbackActiveRef.current)) {
        logVoiceMetric('stt_prewarm_skipped', {
          provider: 'xunfei', reason: 'not_playback_ready',
          routePresence: routePresenceRef.current,
          playbackActive: playbackActiveRef.current,
          sessionActive: sessionActiveRef.current,
        })
        return false
      }
      const existing = xunfeiSessionSttRef.current
      if (existing && !existing.settled && !prewarm && existing.prewarmed && !existing.recordingStarted && existing.startRecording) {
        await existing.startRecording('consume_prewarm')
        return true
      }
      if (existing && !existing.settled) return true
      if (existing) await settleWithTimeout(existing.stopped, STT_STOP_SETTLE_TIMEOUT_MS)
      await delay(STT_RESTART_DEBOUNCE_MS)
      if (!canUseXunfeiRoute('after_restart_debounce')) return false
      if (!availableSessionSttProviders.includes('xunfei') || !isPcmCaptureAvailable()) {
        logVoiceMetric('stt_provider_fallback', {
          requested: 'xunfei',
          reason: !isPcmCaptureAvailable() ? 'pcm_unavailable' : 'provider_unavailable',
        })
        return nativeSpeechStartListeningRef.current('en-US')
      }
      if (auth.state !== 'signed-in') return nativeSpeechStartListeningRef.current('en-US')

      const streamStartedAt = Date.now()
      let socket: WebSocket | null = null
      let frameSubscription: { remove: () => void } | null = null
      let stateSubscription: { remove: () => void } | null = null
      let finalizeTimer: ReturnType<typeof setTimeout> | null = null
      let hardTimer: ReturnType<typeof setTimeout> | null = null
      let noFrameTimer: ReturnType<typeof setTimeout> | null = null
      let stoppedTimer: ReturnType<typeof setTimeout> | null = null
      let prewarmStaleTimer: ReturnType<typeof setTimeout> | null = null
      let bootstrapTimer: ReturnType<typeof setTimeout> | null = null
      let bootstrapTimedOut = false
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
        const currentMatch = current?.streamId === streamId && generation === sessionGenerationRef.current
        if (!currentMatch) {
          logVoiceMetric('stt_callback_ignored', {
            provider: 'xunfei', context, streamId, generation,
            currentStreamId: current?.streamId ?? null,
            currentGeneration: sessionGenerationRef.current,
          })
        }
        return currentMatch
      }

      const updateCurrent = () => {
        xunfeiSessionSttRef.current = {
          socket, frameSubscription, stateSubscription,
          finalizeTimer, hardTimer, noFrameTimer, stoppedTimer,
          streamId, generation,
          prewarmed: prewarm,
          recordingStarted, settled,
          stopped: stoppedSignal.stopped,
          resolveStopped: stoppedSignal.resolveStopped,
          startRecording: startStreamingPcm,
        }
      }

      const clearNoFrameTimer = () => {
        if (!noFrameTimer) return
        clearTimeout(noFrameTimer)
        noFrameTimer = null
        updateCurrent()
      }

      const settle = (reason: string, submitted: boolean) => {
        if (settled) return
        settled = true
        updateCurrent()
        if (bootstrapTimer !== null) { clearTimeout(bootstrapTimer); bootstrapTimer = null }
        if (finalizeTimer) clearTimeout(finalizeTimer)
        if (hardTimer) clearTimeout(hardTimer)
        if (noFrameTimer) clearTimeout(noFrameTimer)
        if (stoppedTimer) clearTimeout(stoppedTimer)
        if (prewarmStaleTimer) clearTimeout(prewarmStaleTimer)
        frameSubscription?.remove()
        void stopPcmCapture(`session_${reason}`).catch(() => undefined).finally(() => {
          stateSubscription?.remove()
          stoppedSignal.resolveStopped()
        })
        if (socket && socket.readyState === WebSocket.OPEN) socket.close()
        stoppedTimer = setTimeout(() => stoppedSignal.resolveStopped(), STT_STOP_SETTLE_TIMEOUT_MS)
        if (xunfeiSessionSttRef.current?.streamId === streamId) xunfeiSessionSttRef.current = null
        logVoiceMetric('stt_end', {
          provider: 'xunfei', cancelled: reason !== 'final', reason,
          streamId, generation, hadTranscript: Boolean(transcript.trim()),
          submitted, elapsedMs: Date.now() - streamStartedAt, frameCount, totalBytes,
        })
      }

      const sendAudioFrame = (status: 0 | 1 | 2, audioBase64: string, session: CreateASRSessionResponse) => {
        if (!socket || socket.readyState !== WebSocket.OPEN || finalFrameSent) return
        if (status === 2) finalFrameSent = true
        audioSequence += 1
        socket.send(JSON.stringify(createXunfeiASRFrame(session, status, audioBase64, audioSequence)))
      }

      const startStreamingPcm = async (context: string) => {
        if (recordingStarted || settled) return
        const activeSession = bootstrappedSession
        if (!activeSession) {
          logVoiceMetric('stt_provider_error', { provider: 'xunfei', message: 'Missing bootstrapped ASR session' })
          settle('missing_session', false)
          return
        }
        if (!isCurrentStream(`start_pcm:${context}`)) return
        if (!canUseXunfeiRoute(`start_pcm:${context}`)) {
          settle('route_inactive', false)
          return
        }
        if (prewarmStaleTimer) {
          clearTimeout(prewarmStaleTimer)
          prewarmStaleTimer = null
        }
        recordingStarted = true
        updateCurrent()
        try {
          const status = await startPcmCapture({
            sampleRate: activeSession.providerConfig?.sampleRate ?? 16000,
            frameDurationMs: activeSession.providerConfig?.frameIntervalMs ?? 40,
          })
          if (!isCurrentStream(`after_pcm_start:${context}`)) return
          if (!canUseXunfeiRoute(`after_pcm_start:${context}`)) {
            void stopPcmCapture('session_route_inactive').catch(() => undefined)
            settle('route_inactive', false)
            return
          }
          listeningStartMsRef.current = Date.now()
          logVoiceMetric('stt_start', { provider: 'xunfei', streamId, generation, prewarmed: prewarm })
          if (bootstrapTimer !== null) { clearTimeout(bootstrapTimer); bootstrapTimer = null }
          logVoiceMetric('stt_ready', {
            provider: 'xunfei', elapsedMs: Date.now() - streamStartedAt,
            sampleRate: status.sampleRate, frameSizeBytes: status.frameSizeBytes, prewarmed: prewarm,
          })
          setStatus('session.status.listening')
          if (!hardTimer && finishAudio) {
            hardTimer = setTimeout(finishAudio, 15_000)
          }
          noFrameTimer = setTimeout(() => {
            if (settled || frameCount > 0) return
            logVoiceMetric('stt_pcm_no_frame', {
              provider: 'xunfei', elapsedMs: Date.now() - streamStartedAt,
              pcmStatusFrameCount: status.frameCount, pcmStatusTotalBytes: status.totalBytes,
            })
            settle('pcm_no_frame', false)
            handleListeningEndedWithoutTranscript()
          }, 1800)
          updateCurrent()
        } catch (error) {
          logVoiceMetric('stt_provider_error', {
            provider: 'xunfei',
            message: error instanceof Error ? error.message : 'PCM capture failed',
          })
          settle('pcm_error', false)
          handleListeningEndedWithoutTranscript()
        }
      }

      try {
        const authReady = await auth.refreshSession()
        if (!canUseXunfeiRoute('after_auth_refresh')) return false
        if (!authReady) return nativeSpeechStartListeningRef.current('en-US')

        const session = await api.createASRSession({
          provider: 'xunfei', mode: 'streaming',
          languageMode: localeRef.current === 'zh' ? 'mixed_zh_en' : 'english',
          scenarioKey: scenarioKey,
          sessionId: snapshotRef.current.sessionId,
          endpointSilenceMs: 900,
          clientTraceId: `mobile-session-${Date.now()}`,
        })
        logVoiceMetric('stt_bootstrap_response', {
          provider: 'xunfei',
          domain: session.providerConfig?.domain,
          language: session.providerConfig?.language,
          accent: session.providerConfig?.accent,
          eosMs: session.providerConfig?.eosMs,
          sessionId: session.sessionId,
          endpointHost: session.endpointUrl ? new URL(session.endpointUrl).host : null,
        })
        if (!canUseXunfeiRoute('after_session_create')) {
          logVoiceMetric('stt_start_stale_after_bootstrap', { provider: 'xunfei' })
          return false
        }
        if (session.provider !== 'xunfei' || session.status !== 'created' || session.transport !== 'websocket' || !session.endpointUrl) {
          logVoiceMetric('stt_provider_fallback', { requested: 'xunfei', reason: 'session_not_ready' })
          return nativeSpeechStartListeningRef.current('en-US')
        }
        bootstrappedSession = session

        logVoiceMetric('stt_bootstrap_start', { provider: 'xunfei' })
        setStatus('session.status.preparing_listening')
        await nativeSpeechCancelListeningRef.current()

        const BOOTSTRAP_TIMEOUT_MS = 10_000
        bootstrapTimer = setTimeout(() => {
          bootstrapTimedOut = true
          logVoiceMetric('stt_bootstrap_timeout', {
            provider: 'xunfei', elapsedMs: Date.now() - streamStartedAt,
          })
          if (!settled) settle('bootstrap_timeout', false)
          void nativeSpeechStartListeningRef.current('en-US')
        }, BOOTSTRAP_TIMEOUT_MS)

        socket = new WebSocket(session.endpointUrl)
        updateCurrent()

        finishAudio = () => {
          if (!isCurrentStream('finish_audio')) {
            settle('route_inactive', false)
            return
          }
          if (finalFrameSent) return
          sendAudioFrame(2, '', session)
          void stopPcmCapture('session_endpoint').catch(() => undefined)
        }

        const scheduleFinalize = () => {
          if (finalizeTimer) clearTimeout(finalizeTimer)
          const finishAudioHandler = finishAudio
          if (!finishAudioHandler) return
          finalizeTimer = setTimeout(finishAudioHandler, session.providerConfig?.eosMs ?? 900)
          updateCurrent()
        }

        stateSubscription = addPcmStateListener(event => {
          if (!isCurrentStream('pcm_state')) return
          logVoiceMetric('stt_pcm_state', {
            provider: 'xunfei', state: event.state,
            frameCount: event.frameCount, totalBytes: event.totalBytes,
            message: event.message,
          })
        })

        frameSubscription = addPcmFrameListener((event: PcmCaptureFrameEvent) => {
          if (!isCurrentStream('pcm_frame')) return
          if (!canUseXunfeiRoute('pcm_frame')) { settle('route_inactive', false); return }
          if (!socket || socket.readyState !== WebSocket.OPEN || finalFrameSent) return
          frameCount += 1
          totalBytes += event.byteCount
          if (frameCount === 1) clearNoFrameTimer()
          sendAudioFrame(firstFrame ? 0 : 1, event.audioBase64, session)
          firstFrame = false
          if (frameCount === 1 || frameCount % 50 === 0) {
            logVoiceMetric('stt_pcm_frame', {
              provider: 'xunfei', frameCount, totalBytes, elapsedMs: event.elapsedMs,
            })
          }
        })

        socket.onopen = () => {
          if (!isCurrentStream('socket_open')) return
          if (!canUseXunfeiRoute('socket_open')) { settle('route_inactive', false); return }
          logVoiceMetric(prewarm ? 'stt_prewarm_ready' : 'stt_socket_ready', {
            provider: 'xunfei', streamId, generation,
            elapsedMs: Date.now() - streamStartedAt,
          })
          if (prewarm) {
            prewarmStaleTimer = setTimeout(() => {
              if (settled || recordingStarted) return
              logVoiceMetric('stt_prewarm_expired', { provider: 'xunfei', streamId, generation })
              settle('prewarm_expired', false)
            }, STT_PREWARM_STALE_TIMEOUT_MS)
            updateCurrent()
            return
          }
          void startStreamingPcm('socket_open')
          if (!hardTimer && finishAudio) hardTimer = setTimeout(finishAudio, 15_000)
          updateCurrent()
        }

        socket.onmessage = event => {
          if (!isCurrentStream('socket_message')) return
          if (!canUseXunfeiRoute('socket_message')) { settle('route_inactive', false); return }
          const payload = parseJsonObject(event.data)
          const header = getObject(payload?.header)
          const code = typeof header?.code === 'number'
            ? header.code
            : typeof payload?.code === 'number' ? payload.code : 0
          if (code !== 0 || (payload && typeof payload === 'object')) {
            const data = getObject(payload?.data)
            const dataResult = data ? getObject(data.result) : null
            logVoiceMetric('stt_xunfei_result_raw', {
              code,
              status: typeof header?.status === 'number' ? header.status : null,
              message: typeof header?.message === 'string' ? header.message.slice(0, 100) : null,
              dataStatus: typeof data?.status === 'number' ? data.status : null,
              hasResult: dataResult !== null, streamId,
            })
          }
          if (code !== 0) {
            const message = typeof header?.message === 'string'
              ? header.message
              : typeof payload?.message === 'string' ? payload.message : `Xunfei ASR error ${code}`
            logVoiceMetric('stt_provider_error', { provider: 'xunfei', code, message })
            settle('provider_error', false)
            handleListeningEndedWithoutTranscript()
            return
          }

          const recognitionResult = extractXunfeiRecognitionResult(payload)
          if (recognitionResult?.text) {
            if (recognitionResult.pgs === 'rpl' && recognitionResult.rg) {
              const [start, end] = recognitionResult.rg
              for (let index = start; index <= end; index += 1) transcriptSegments[index] = ''
            }
            if (recognitionResult.sn != null) {
              transcriptSegments[recognitionResult.sn] = recognitionResult.text
            } else {
              transcriptSegments.push(recognitionResult.text)
            }
            transcript = transcriptSegments.filter(Boolean).join('').trim()
            if (!firstPartialAt) {
              firstPartialAt = Date.now()
              logVoiceMetric('stt_first_partial', {
                provider: 'xunfei', elapsedMs: firstPartialAt - streamStartedAt, chars: transcript.length,
              })
            }
            logVoiceMetric('stt_partial', { provider: 'xunfei', chars: transcript.length })
            scheduleFinalize()
          }

          const data = getObject(payload?.data)
          const status = typeof header?.status === 'number'
            ? header.status
            : typeof data?.status === 'number' ? data.status : undefined
          if (status === 2) {
            finalReceived = true
            const normalized = transcript.trim()
            if (normalized) {
              sttRestartCountRef.current = 0
              sttRestartStartMsRef.current = 0
              logVoiceMetric('stt_submit', {
                provider: 'xunfei', source: 'xunfei_final', chars: normalized.length,
                elapsedMs: Date.now() - streamStartedAt,
              })
              void handleNativeFinalTranscript(normalized)
              settle('final', true)
            } else {
              settle('final', false)
              handleListeningEndedWithoutTranscript()
            }
          }
        }

        socket.onerror = () => {
          if (!isCurrentStream('socket_error')) return
          logVoiceMetric('stt_provider_error', { provider: 'xunfei', message: 'WebSocket error' })
          settle('socket_error', false)
          handleListeningEndedWithoutTranscript()
        }

        socket.onclose = event => {
          if (!isCurrentStream('socket_close')) return
          logVoiceMetric('stt_socket_close', {
            provider: 'xunfei',
            code: typeof event?.code === 'number' ? event.code : null,
            reason: typeof event?.reason === 'string' ? event.reason : '',
            wasClean: Boolean(event?.wasClean),
            finalReceived, finalFrameSent, frameCount, totalBytes,
          })
          if (!finalReceived && !settled) {
            settle('socket_closed', false)
            handleListeningEndedWithoutTranscript()
          }
        }

        updateCurrent()
        return true
      } catch (error) {
        logVoiceMetric('stt_provider_error', {
          provider: 'xunfei',
          message: error instanceof Error ? error.message : 'Xunfei STT failed to start',
        })
        settle('start_error', false)
        return nativeSpeechStartListeningRef.current('en-US')
      }
    })
  }, [
    api, auth, availableSessionSttProviders, canStartSessionListening, enqueueSttOperation,
    handleListeningEndedWithoutTranscript, handleNativeFinalTranscript, logVoiceMetric,
    scenarioKey, setStatus, localeRef, snapshotRef, sessionGenerationRef, sessionActiveRef,
    nativeSpeechStartListeningRef, nativeSpeechCancelListeningRef,
    routePresenceRef, canListenOnRouteRef, playbackActiveRef, audioPlayingRef,
    listeningStartMsRef, sttStreamIdRef, sttRestartCountRef, sttRestartStartMsRef,
  ])

  return { xunfeiSessionSttRef, startXunfeiSessionListening, cancelXunfeiSessionListening }
}
