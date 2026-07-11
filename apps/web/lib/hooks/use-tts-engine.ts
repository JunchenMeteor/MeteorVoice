'use client'

/**
 * TTS engine hook (text synthesis, playback).
 * TTS 引擎 Hook。
 */

import { useCallback } from 'react'

import { readApiJsonResponse } from '@meteorvoice/api-client'
import { canSamplePlaybackLevel } from '@meteorvoice/session-core'
import { getTTSSpeedRouting } from '@meteorvoice/shared'

import type { WorkflowSnapshot } from '@/lib/conversation-workflow'
import type { PlaybackEngine } from '@/lib/hooks/use-playback-engine'
import type { TTSSpeed } from '@/lib/tts-speed'
import { createMockTTS } from '@/lib/providers/mock-tts'
import {
  playAudioToEnd,
  PlaybackBlockedError,
} from '@/lib/audio-engine'

const mockTTS = createMockTTS()

interface TTSEngineContext {
  playback: PlaybackEngine
  setVoiceLevel: React.Dispatch<React.SetStateAction<number | null>>
  ttsProviderRef: React.RefObject<string>
  ttsSpeedRef: React.RefObject<TTSSpeed>
  ttsVoiceIdRef: React.RefObject<string | null>
  activeSessionRef: React.RefObject<boolean>
  activeTurnRef: React.RefObject<number>
  canListenOnRouteRef: React.RefObject<boolean>
  snapshotRef: React.RefObject<WorkflowSnapshot>
  setStatusText: (text: string) => void
  tr: (key: string) => string
}

export interface TTSEngine {
  speakText: (text: string, accentName: string) => Promise<void>
}

/**
 * TTS 引擎：负责文本到语音的合成、播放、错误恢复和 mock 降级。
 * 内部调用 /api/tts 获取音频，通过 playback engine 播放；
 * 如果 TTS provider 失败，自动降级到 mock TTS。
 */
export function useTTSEngine(ctx: TTSEngineContext): TTSEngine {
  const {
    playback,
    setVoiceLevel,
    ttsProviderRef,
    ttsSpeedRef,
    ttsVoiceIdRef,
    activeSessionRef,
    activeTurnRef,
    canListenOnRouteRef,
    snapshotRef,
    setStatusText,
    tr,
  } = ctx

  const speakText = useCallback(async (text: string, accentName: string) => {
    const updatePlaybackLevel = (level: number | null) => {
      if (canSamplePlaybackLevel({
        activeSession: activeSessionRef.current,
        activeTurnId: activeTurnRef.current,
        currentTurnId: activeTurnRef.current,
        canListenOnRoute: canListenOnRouteRef.current,
        workflowState: snapshotRef.current.state,
      })) {
        setVoiceLevel(level)
      }
    }

    try {
      const provider = ttsProviderRef.current
      const speed = ttsSpeedRef.current
      if (provider === 'mock') {
        setVoiceLevel(null)
        await mockTTS.synthesize(text, { accent: accentName, speed })
        return
      }
      const playTTS = async (speechText: string) => {
        const speedRouting = getTTSSpeedRouting(provider, speed)
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-MeteorVoice-Client': 'meteorvoice-web' },
          body: JSON.stringify({ text: speechText, accent: accentName, provider, speed: speedRouting.requestSpeed, voiceId: ttsVoiceIdRef.current }),
        })
        const result = await readApiJsonResponse<{ audioUrl?: string }>(res, 'TTS request failed')
        if (!result.audioUrl) throw new Error('TTS response did not include audioUrl')

        try {
          await playAudioToEnd(result.audioUrl, {
            audio: playback.getSessionAudio(),
            playbackNodesRef: playback.playbackNodesRef,
            onLevel: updatePlaybackLevel,
            speed: speedRouting.playbackRate,
          })
        } catch (error) {
          if (error instanceof PlaybackBlockedError) {
            setStatusText(tr('session.playback_blocked'))
            await playback.waitForBlockedPlayback(error.audioUrl, updatePlaybackLevel, speedRouting.playbackRate)
            return
          }
          throw error
        }
      }

      await playTTS(text)
    } catch {
      setVoiceLevel(null)
      await mockTTS.synthesize(text, { accent: accentName, speed: ttsSpeedRef.current })
    } finally {
      setVoiceLevel(null)
    }
  }, [activeSessionRef, activeTurnRef, canListenOnRouteRef, playback, setVoiceLevel, snapshotRef, setStatusText, tr, ttsProviderRef, ttsSpeedRef, ttsVoiceIdRef])

  return { speakText }
}
