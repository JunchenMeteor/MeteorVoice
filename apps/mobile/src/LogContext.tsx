import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createASREvaluationReport, type VoiceMetricEntry } from './sessionRuntime'

export interface LogContextValue {
  logMetric: (stage: string, data?: Record<string, unknown>) => void
  logUserAction: (action: string, data?: Record<string, unknown>) => void
  voiceMetrics: VoiceMetricEntry[]
  voiceMetricsText: string
  asrEvaluationText: string
  clearVoiceMetrics: () => void
  setEnrichment: (data: Record<string, unknown> | null) => void
}

const LogContext = createContext<LogContextValue | null>(null)

export function useLog(): LogContextValue {
  const ctx = useContext(LogContext)
  if (!ctx) {
    throw new Error('useLog must be used within LogProvider')
  }
  return ctx
}

/**
 * LogProvider — 全局日志系统
 *
 * 任何组件都可以通过 useLog() 获取日志能力。
 * 不绑定会话生命周期，独立于 SessionContext。
 */
export function LogProvider({ children }: { children: React.ReactNode }) {
  const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetricEntry[]>([])
  const voiceMetricSeqRef = useRef(0)
  const enrichmentRef = useRef<Record<string, unknown> | null>(null)

  const setEnrichment = useCallback((data: Record<string, unknown> | null) => {
    enrichmentRef.current = data
  }, [])

  const logMetric = useCallback((stage: string, data: Record<string, unknown> = {}) => {
    const seq = ++voiceMetricSeqRef.current
    const enriched = { ...enrichmentRef.current, metricSeq: seq, ...data }
    const entry = { ts: Date.now(), stage, data: enriched }
    console.info('[voice-metrics]', JSON.stringify(entry))
    setVoiceMetrics(previous => [...previous.slice(-239), entry])
  }, [])

  const logUserAction = useCallback((action: string, data: Record<string, unknown> = {}) => {
    logMetric('user_action', { action, ...data })
  }, [logMetric])

  const clearVoiceMetrics = useCallback(() => {
    setVoiceMetrics([])
  }, [])

  const voiceMetricsText = useMemo(() => {
    return voiceMetrics
      .map(entry => `${new Date(entry.ts).toLocaleTimeString()} ${entry.stage} ${JSON.stringify(entry.data)}`)
      .join('\n')
  }, [voiceMetrics])

  const asrEvaluationText = useMemo(() => createASREvaluationReport(voiceMetrics), [voiceMetrics])

  const value = useMemo(() => ({
    logMetric,
    logUserAction,
    voiceMetrics,
    voiceMetricsText,
    asrEvaluationText,
    clearVoiceMetrics,
    setEnrichment,
  }), [logMetric, logUserAction, voiceMetrics, voiceMetricsText, asrEvaluationText, clearVoiceMetrics, setEnrichment])

  return (
    <LogContext.Provider value={value}>
      {children}
    </LogContext.Provider>
  )
}
