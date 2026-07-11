/**
 * useXunfeiStt — Xunfei ASR WebSocket Engine / 讯飞流式语音识别 WebSocket 引擎
 *
 * Manages the complete lifecycle of a Xunfei streaming ASR session:
 *   create session → open WebSocket → start PCM capture → stream frames
 *   → receive partial/final results → cleanup
 * 管理讯飞流式 ASR 会话的完整生命周期：
 *   创建会话 → 打开 WebSocket → 启动 PCM 采集 → 流式发送帧
 *   → 接收部分/最终结果 → 清理
 *
 * @deps
 *   api, auth            — network / auth / 网络与鉴权
 *   logMetric, setStatus — logging / UI / 日志与 UI 状态
 *   enqueueSttOperation, canStartSessionListening — STT queue / gate / STT 队列与门控
 *   locale, selectedScenarioKey — session context / 会话上下文
 *   snapshotRef, sessionGeneration, sttStreamId, ... — mutable refs / 可变引用
 *   sessionActive, routePresence, ... — session state refs / 会话状态引用
 *   nativeSpeechStart, nativeSpeechCancelListeningRef — fallback / 降级回退
 *   finalTranscript, endedWithoutTranscript — ref bridges to orchestration / 引用桥接到编排层
 *
 * @returns
 *   xunfeiSessionSttRef          — current session state (socket, timers, subscriptions) / 当前会话状态
 *   startXunfeiSessionListening  — start or prewarm a Xunfei session / 启动或预热讯飞会话
 *   cancelXunfeiSessionListening — cleanly tear down / 清理并关闭会话
 */
import {
  useCallback,
  useRef,
} from 'react'

import type {
  CreateASRSessionResponse,
  MeteorVoiceApiClient,
} from '@meteorvoice/api-client'

import type { PcmCaptureFrameEvent } from '../voicePcmCapture'
import type { XunfeiSessionSttState } from '../sessionRuntime'
import {
  createXunfeiASRFrame,
  extractXunfeiRecognitionResult,
  getObject,
  parseJsonObject,
} from '../xunfeiAsrWire'
import {
  addPcmFrameListener,
  addPcmStateListener,
  isPcmCaptureAvailable,
  startPcmCapture,
  stopPcmCapture,
} from '../voicePcmCapture'
import {
  createStoppedSignal,
  delay,
  settleWithTimeout,
  STT_PREWARM_STALE_TIMEOUT_MS,
  STT_RESTART_DEBOUNCE_MS,
  STT_STOP_SETTLE_TIMEOUT_MS,
} from '../sessionRuntime'

interface XunfeiSttDeps {
  network: {
    api: MeteorVoiceApiClient
    auth: { state: string; refreshSession: () => Promise<boolean> }
  }
  context: {
    locale: string
    selectedScenarioKey: string
  }
  refs: {
    snapshot: React.MutableRefObject<{ sessionId: string }>
    sessionGeneration: React.MutableRefObject<number>
    sttStreamId: React.MutableRefObject<number>
    sttRestartCount: React.MutableRefObject<number>
    sttRestartStartMs: React.MutableRefObject<number>
    listeningStartMs: React.MutableRefObject<number>
  }
  session: {
    sessionActive: React.MutableRefObject<boolean>
    routePresence: React.MutableRefObject<string>
    canListenOnRoute: React.MutableRefObject<boolean>
    playbackActive: React.MutableRefObject<boolean>
    audioPlaying: React.MutableRefObject<boolean>
  }
  callbacks: {
    logMetric: (stage: string, data?: Record<string, unknown>) => void
    setStatus: (status: string) => void
    enqueueSttOperation: <T>(label: string, op: () => Promise<T>) => Promise<T>
    canStartSessionListening: (context: string, generation?: number) => boolean
  }
  bridge: {
    nativeSpeechStart: React.MutableRefObject<(lang?: string) => Promise<boolean>>
    nativeSpeechCancel: React.MutableRefObject<() => void | Promise<void>>
    finalTranscript: React.MutableRefObject<(t: string) => Promise<void>>
    endedWithoutTranscript: React.MutableRefObject<() => void>
  }
}

function clearXunfeiTimers(timers: XunfeiSessionSttState['timers']) {
  Object.values(timers).forEach(timer => {
    if (timer) clearTimeout(timer)
  })
}

export function useXunfeiStt(deps: XunfeiSttDeps) {
  const { network, context, refs, session, callbacks, bridge } = deps
  const { api, auth } = network
  const { locale, selectedScenarioKey } = context
  const { logMetric, setStatus, enqueueSttOperation, canStartSessionListening } = callbacks
  const { snapshot, sessionGeneration, sttStreamId, sttRestartCount, sttRestartStartMs, listeningStartMs } = refs
  const { sessionActive, routePresence, canListenOnRoute, playbackActive, audioPlaying } = session
  const { nativeSpeechStart, nativeSpeechCancel, finalTranscript, endedWithoutTranscript } = bridge

  const xunfeiSessionSttRef = useRef<XunfeiSessionSttState | null>(null)

  const cancelXunfeiSessionListening = useCallback(async (reason = 'cancel') => {
    await enqueueSttOperation(`stop:${reason}`, async () => {
      const current = xunfeiSessionSttRef.current
      if (!current) return
      if (current.settled) {
        await settleWithTimeout(current.stopped, STT_STOP_SETTLE_TIMEOUT_MS)
        return
      }
      current.settled = true
      clearXunfeiTimers(current.timers)
      current.subscriptions.frame?.remove()
      current.subscriptions.state?.remove()
      if (current.socket && current.socket.readyState === WebSocket.OPEN) current.socket.close()
      await stopPcmCapture(`session_${reason}`).catch(() => undefined)
      current.resolveStopped?.()
      if (xunfeiSessionSttRef.current === current) xunfeiSessionSttRef.current = null
      await settleWithTimeout(current.stopped, STT_STOP_SETTLE_TIMEOUT_MS)
    })
  }, [enqueueSttOperation])

  const startXunfeiSessionListening = useCallback(async (prewarm = false) => {
    return enqueueSttOperation(prewarm ? 'prewarm:xunfei' : 'start:xunfei', async () => {
      const generation = sessionGeneration.current
      const streamId = ++sttStreamId.current
      let recordingStarted = false

      const canUseXunfeiRoute = (context: string) => {
        const allowed = prewarm && !recordingStarted
          ? sessionActive.current && routePresence.current === 'inSession' && canListenOnRoute.current &&
            generation === sessionGeneration.current && playbackActive.current && audioPlaying.current
          : canStartSessionListening(context, generation)
        if (!allowed) logMetric('stt_stream_aborted', { provider: 'xunfei', context, streamId, generation, prewarm })
        return allowed
      }

      if (!prewarm && !canUseXunfeiRoute('entry')) return false
      if (prewarm && (!sessionActive.current || routePresence.current !== 'inSession' || !playbackActive.current)) return false

      const existing = xunfeiSessionSttRef.current
      if (existing && !existing.settled && !prewarm && existing.prewarmed && !existing.recordingStarted && existing.startRecording) {
        await existing.startRecording('consume_prewarm')
        return true
      }
      if (existing && !existing.settled) return true
      if (existing) await settleWithTimeout(existing.stopped, STT_STOP_SETTLE_TIMEOUT_MS)
      await delay(STT_RESTART_DEBOUNCE_MS)
      if (!canUseXunfeiRoute('after_restart_debounce')) return false
      if (!isPcmCaptureAvailable()) return nativeSpeechStart.current('en-US')
      if (auth.state !== 'signed-in') return nativeSpeechStart.current('en-US')

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
      let startRecording: ((context: string) => Promise<void>) | undefined

      const isCurrentStream = () => {
        const current = xunfeiSessionSttRef.current
        return current && current.streamId === streamId && generation === sessionGeneration.current
      }

      const updateCurrent = () => {
        xunfeiSessionSttRef.current = {
          streamId,
          socket,
          subscriptions: {
            frame: frameSubscription,
            state: stateSubscription,
          },
          timers: {
            bootstrap: bootstrapTimer,
            finalize: finalizeTimer,
            hard: hardTimer,
            noFrame: noFrameTimer,
            prewarmStale: prewarmStaleTimer,
            stopped: stoppedTimer,
          },
          generation, prewarmed: prewarm, recordingStarted, settled,
          stopped: stoppedSignal.stopped, resolveStopped: stoppedSignal.resolveStopped,
          startRecording,
        }
      }

      const settle = (reason: string) => {
        if (settled) return
        settled = true; updateCurrent()
        clearXunfeiTimers({
          bootstrap: bootstrapTimer,
          finalize: finalizeTimer,
          hard: hardTimer,
          noFrame: noFrameTimer,
          prewarmStale: prewarmStaleTimer,
          stopped: stoppedTimer,
        })
        bootstrapTimer = null
        finalizeTimer = null
        hardTimer = null
        noFrameTimer = null
        prewarmStaleTimer = null
        stoppedTimer = null
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
        if (!authReady) return nativeSpeechStart.current('en-US')

        const session = await api.createASRSession({
          provider: 'xunfei', mode: 'streaming',
          languageMode: locale === 'zh' ? 'mixed_zh_en' : 'english',
          scenarioKey: selectedScenarioKey,
          sessionId: snapshot.current.sessionId,
          endpointSilenceMs: 900,
          clientTraceId: `mobile-session-${Date.now()}`,
        })

        if (!canUseXunfeiRoute('after_session_create')) return false
        if (session.provider !== 'xunfei' || session.status !== 'created' || session.transport !== 'websocket' || !session.endpointUrl) {
          return nativeSpeechStart.current('en-US')
        }
        bootstrappedSession = session
        setStatus('session.status.preparing_listening')
        await nativeSpeechCancel.current()

        bootstrapTimer = setTimeout(() => {
          if (!settled) { settle('bootstrap_timeout'); void nativeSpeechStart.current('en-US') }
        }, 10_000)

        socket = new WebSocket(session.endpointUrl)
        updateCurrent()

        // PCM state listener — diagnostic logging
        stateSubscription = addPcmStateListener(event => {
          if (!isCurrentStream()) return
          logMetric('stt_pcm_state', {
            provider: 'xunfei', state: event.state,
            frameCount: event.frameCount, totalBytes: event.totalBytes,
            message: event.message,
          })
        })

        // PCM frame listener — streams microphone audio to Xunfei WebSocket
        frameSubscription = addPcmFrameListener((event: PcmCaptureFrameEvent) => {
          if (!isCurrentStream()) return
          if (!canUseXunfeiRoute('pcm_frame')) { settle('route_inactive'); return }
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
          if (!isCurrentStream()) { settle('route_inactive'); return }
          if (finalFrameSent) return
          sendAudioFrame(2, '')
          void stopPcmCapture('session_endpoint').catch(() => undefined)
        }

        socket.onopen = () => {
          if (!isCurrentStream()) return
          if (!canUseXunfeiRoute('socket_open')) { settle('route_inactive'); return }
          startRecording = async (context: string) => {
            if (recordingStarted || settled) return
            if (!bootstrappedSession) { settle('missing_session'); return }
            if (!isCurrentStream()) return
            if (!canUseXunfeiRoute(`start_pcm:${context}`)) { settle('route_inactive'); return }
            if (prewarmStaleTimer) { clearTimeout(prewarmStaleTimer); prewarmStaleTimer = null }
            recordingStarted = true; updateCurrent()
            try {
              await startPcmCapture({ sampleRate: bootstrappedSession.providerConfig?.sampleRate ?? 16000, frameDurationMs: bootstrappedSession.providerConfig?.frameIntervalMs ?? 40 })
              if (!isCurrentStream()) return
              if (!canUseXunfeiRoute(`after_pcm_start:${context}`)) { void stopPcmCapture('session_route_inactive').catch(() => undefined); settle('route_inactive'); return }
              listeningStartMs.current = Date.now()
              if (bootstrapTimer) { clearTimeout(bootstrapTimer); bootstrapTimer = null }
              setStatus('session.status.listening')
              if (!hardTimer && finishAudio) hardTimer = setTimeout(finishAudio, 15_000)
              noFrameTimer = setTimeout(() => {
                if (settled || frameCount > 0) return
                settle('pcm_no_frame')
                endedWithoutTranscript.current()
              }, 1800)
              updateCurrent()
            } catch { settle('pcm_error'); endedWithoutTranscript.current() }
          }
          if (prewarm) {
            prewarmStaleTimer = setTimeout(() => {
              if (settled || recordingStarted) return
              settle('prewarm_expired')
            }, STT_PREWARM_STALE_TIMEOUT_MS)
            updateCurrent()
            return
          }
          updateCurrent()
          void startRecording('socket_open')
          if (!hardTimer && finishAudio) hardTimer = setTimeout(finishAudio, 15_000)
          updateCurrent()
        }

        socket.onmessage = event => {
          if (!isCurrentStream()) return
          const payload = parseJsonObject(event.data)
          const header = getObject(payload?.header)
          const code = typeof header?.code === 'number' ? header.code : typeof payload?.code === 'number' ? payload.code : 0
          if (code !== 0) { settle('provider_error'); endedWithoutTranscript.current(); return }

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
              sttRestartCount.current = 0; sttRestartStartMs.current = 0
              void finalTranscript.current(normalized)
              settle('final')
            } else { settle('final'); endedWithoutTranscript.current() }
          }
        }

        socket.onerror = () => { if (isCurrentStream()) { settle('socket_error'); endedWithoutTranscript.current() } }

        socket.onclose = () => {
          if (!isCurrentStream()) return
          if (!finalReceived && !settled) { settle('socket_closed'); endedWithoutTranscript.current() }
        }
        updateCurrent()
        return true
      } catch (error) {
        logMetric('stt_provider_error', { provider: 'xunfei', message: error instanceof Error ? error.message : 'Xunfei STT failed to start' })
        settle('start_error')
        return nativeSpeechStart.current('en-US')
      }
    })
  }, [
    api, auth, canStartSessionListening, enqueueSttOperation, locale, logMetric,
    selectedScenarioKey, setStatus, snapshot,
    sessionGeneration, sttStreamId, sttRestartCount, sttRestartStartMs,
    listeningStartMs,
    sessionActive, routePresence, canListenOnRoute,
    playbackActive, audioPlaying,
    nativeSpeechStart, nativeSpeechCancel,
    finalTranscript, endedWithoutTranscript,
  ])

  return { xunfeiSessionSttRef, startXunfeiSessionListening, cancelXunfeiSessionListening }
}
