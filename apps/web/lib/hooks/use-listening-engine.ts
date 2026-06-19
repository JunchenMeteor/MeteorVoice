'use client'

import { useCallback, useRef, useState } from 'react'
import { type AudioLevelStop, createMicLevelSampler } from '@/lib/audio-engine'
import {
  canSampleListeningLevel,
  createVoiceActivitySnapshot,
  updateVoiceActivitySnapshot,
  type VoiceActivitySnapshot,
} from '@meteorvoice/session-core'

/** 传入 hook 的共享上下文：这些 ref 由 Provider 持有，hook 需要读取来做 turn 守卫 */
interface ListeningContext {
  activeSessionRef: React.RefObject<boolean | undefined>
  activeTurnRef: React.RefObject<number>
  canListenOnRouteRef: React.RefObject<boolean | undefined>
  snapshotRef: React.RefObject<WorkflowSnapshot>
  voiceActivityRef: React.RefObject<VoiceActivitySnapshot>
}

import type { WorkflowSnapshot } from '@/lib/conversation-workflow'

export interface ListeningEngine {
  voiceLevel: number | null
  setVoiceLevel: React.Dispatch<React.SetStateAction<number | null>>
  voiceLevelRequestRef: React.RefObject<number>
  stopVoiceLevelRef: React.RefObject<AudioLevelStop | null>
  stopVoiceLevelSampling: () => void
  startListeningLevelSampling: (turnId: number) => void
}

/**
 * 麦克风音量采样引擎。
 * 负责 createMicLevelSampler 的启停、request 编号防竞态、VAD 快照更新。
 * 不负责 endpointing 判断（那是 simulateTurn 的职责）。
 */
export function useListeningEngine(ctx: ListeningContext): ListeningEngine {
  const [voiceLevel, setVoiceLevel] = useState<number | null>(null)
  const voiceLevelRequestRef = useRef(0)
  const stopVoiceLevelRef = useRef<AudioLevelStop | null>(null)

  const stopVoiceLevelSampling = useCallback(() => {
    voiceLevelRequestRef.current += 1
    stopVoiceLevelRef.current?.()
    stopVoiceLevelRef.current = null
    ctx.voiceActivityRef.current = createVoiceActivitySnapshot()
    setVoiceLevel(null)
  }, [ctx.voiceActivityRef])

  const startListeningLevelSampling = useCallback((turnId: number) => {
    stopVoiceLevelSampling()
    const requestId = voiceLevelRequestRef.current
    void createMicLevelSampler(level => {
      if (
        canSampleListeningLevel({
          activeSession: ctx.activeSessionRef.current as boolean,
          activeTurnId: ctx.activeTurnRef.current,
          currentTurnId: turnId,
          canListenOnRoute: ctx.canListenOnRouteRef.current as boolean,
          workflowState: ctx.snapshotRef.current.state,
        })
      ) {
        ctx.voiceActivityRef.current = updateVoiceActivitySnapshot(ctx.voiceActivityRef.current, { level })
        setVoiceLevel(level)
      }
    }).then(stop => {
      if (!stop) return
      if (
        voiceLevelRequestRef.current !== requestId ||
        !canSampleListeningLevel({
          activeSession: ctx.activeSessionRef.current as boolean,
          activeTurnId: ctx.activeTurnRef.current,
          currentTurnId: turnId,
          canListenOnRoute: ctx.canListenOnRouteRef.current as boolean,
          workflowState: ctx.snapshotRef.current.state,
        })
      ) {
        stop()
        return
      }
      stopVoiceLevelRef.current = stop
    })
  }, [ctx, stopVoiceLevelSampling])

  return {
    voiceLevel,
    setVoiceLevel,
    voiceLevelRequestRef,
    stopVoiceLevelRef,
    stopVoiceLevelSampling,
    startListeningLevelSampling,
  }
}
