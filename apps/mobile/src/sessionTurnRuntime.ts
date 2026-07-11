/**
 * Turn runtime utilities (staleness, terminal classification).
 * 轮次运行时工具。
 */

export type TurnRuntimeGuardSnapshot = {
  turnRequestId: number
  currentTurnRequestId: number
  generation: number
  currentGeneration: number
  sessionActive: boolean
}

export type EndpointRuntimeGuardSnapshot = {
  endpointRequestId: number
  currentEndpointRequestId: number
  sessionActive: boolean
  canListenOnRoute: boolean
  playbackActive: boolean
}

export function isTurnStale(snapshot: TurnRuntimeGuardSnapshot) {
  return snapshot.turnRequestId !== snapshot.currentTurnRequestId ||
    !snapshot.sessionActive ||
    snapshot.generation !== snapshot.currentGeneration
}

export function canApplyEndpointResult(snapshot: EndpointRuntimeGuardSnapshot) {
  return snapshot.endpointRequestId === snapshot.currentEndpointRequestId &&
    snapshot.sessionActive &&
    snapshot.canListenOnRoute &&
    !snapshot.playbackActive
}

export function classifyRequestTerminalStage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Coach request failed'
  return {
    stage: message.toLowerCase().includes('timed out') ? 'submit_turn_timeout' : 'submit_turn_error',
    message,
  }
}
