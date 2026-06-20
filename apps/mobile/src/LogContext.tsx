/**
 * LogProvider — global logging and metrics system.
 * 全局日志和指标系统。
 *
 * Independent of session lifecycle. Any component can useLog() to log metrics
 * or user actions. AppInner injects session enrichment via setEnrichment().
 * 独立于会话生命周期。任何组件都可以通过 useLog() 记录指标或用户操作。
 * AppInner 通过 setEnrichment() 注入会话上下文。
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createASREvaluationReport } from './sessionRuntime'
import type { VoiceMetricEntry } from './sessionRuntime'

export interface LogContextValue {
  asrEvaluationText: string
  clearVoiceMetrics: () => void
  logMetric: (stage: string, data?: Record<string, unknown>) => void
  logUserAction: (action: string, data?: Record<string, unknown>) => void
  setEnrichment: (data: Record<string, unknown> | null) => void
  voiceMetrics: VoiceMetricEntry[]
  voiceMetricsText: string
}

const LogContext = createContext<LogContextValue | null>(null)

export function useLog(): LogContextValue {
  const ctx = useContext(LogContext)
  if (!ctx) {
    throw new Error('useLog must be used within LogProvider')
  }
  return ctx
}

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

  const clearVoiceMetrics = useCallback(() => setVoiceMetrics([]), [])

  const voiceMetricsText = useMemo(() =>
    voiceMetrics.map(e => `${new Date(e.ts).toLocaleTimeString()} ${e.stage} ${JSON.stringify(e.data)}`).join('\n'),
  [voiceMetrics])

  const asrEvaluationText = useMemo(() => createASREvaluationReport(voiceMetrics), [voiceMetrics])

  const value = useMemo(() => ({
    asrEvaluationText,
    clearVoiceMetrics,
    logMetric,
    logUserAction,
    setEnrichment,
    voiceMetrics,
    voiceMetricsText,
  }), [asrEvaluationText, clearVoiceMetrics, logMetric, logUserAction, setEnrichment, voiceMetrics, voiceMetricsText])

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>
}
