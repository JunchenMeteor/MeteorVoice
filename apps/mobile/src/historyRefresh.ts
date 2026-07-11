export type HistoryAuthState = 'unconfigured' | 'loading' | 'signed-out' | 'signed-in' | 'error'

export function getHistoryLoadRequestKey(authState: HistoryAuthState, userId: string | null, focusVersion: number) {
  return authState === 'signed-in' && userId ? `${userId}:${focusVersion}` : null
}
