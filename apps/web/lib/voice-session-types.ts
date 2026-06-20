/**
 * Voice session type definitions. / 语音会话类型定义。
 */
export type PendingPlayback = {
  audioUrl: string
  onLevel?: (level: number | null) => void
  speed?: number
  resolve: () => void
}
