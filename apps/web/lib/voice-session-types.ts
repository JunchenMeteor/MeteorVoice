export type PendingPlayback = {
  audioUrl: string
  onLevel?: (level: number | null) => void
  speed?: number
  resolve: () => void
}
