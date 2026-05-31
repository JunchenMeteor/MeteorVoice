export const DEFAULT_ECHO_WINDOW_MS = 3500
export const DEFAULT_ECHO_MIN_NORMALIZED_LENGTH = 8
export const DEFAULT_ECHO_CONTAINMENT_MIN_LENGTH = 8
export const DEFAULT_ECHO_OVERLAP_MIN_LENGTH = 16
export const DEFAULT_ECHO_OVERLAP_THRESHOLD = 0.78

export interface PlaybackEchoGuardInput {
  transcript: string
  lastAssistantResponse?: string | null
  playbackEndedAtMs?: number | null
  nowMs?: number
  maxEchoWindowMs?: number
  minNormalizedLength?: number
  containmentMinLength?: number
  overlapMinLength?: number
  overlapThreshold?: number
}

export interface PlaybackEchoGuardResult {
  shouldIgnore: boolean
  reason:
    | 'no_transcript'
    | 'no_assistant_response'
    | 'outside_echo_window'
    | 'too_short'
    | 'contained_in_assistant_response'
    | 'high_overlap_with_assistant_response'
    | 'not_echo'
  normalizedTranscript: string
  normalizedAssistantResponse: string
  overlapRatio: number
}

export function normalizeEchoText(value?: string | null): string {
  return value
    ?.normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, '') ?? ''
}

function getCharacterRecall(candidate: string, source: string): number {
  if (!candidate) return 0

  const sourceCounts = new Map<string, number>()
  for (const char of source) {
    sourceCounts.set(char, (sourceCounts.get(char) ?? 0) + 1)
  }

  let matches = 0
  for (const char of candidate) {
    const available = sourceCounts.get(char) ?? 0
    if (available <= 0) continue
    matches += 1
    sourceCounts.set(char, available - 1)
  }

  return matches / Array.from(candidate).length
}

export function shouldIgnoreLikelyPlaybackEcho(input: PlaybackEchoGuardInput): PlaybackEchoGuardResult {
  const normalizedTranscript = normalizeEchoText(input.transcript)
  const normalizedAssistantResponse = normalizeEchoText(input.lastAssistantResponse)
  const baseResult = {
    normalizedTranscript,
    normalizedAssistantResponse,
    overlapRatio: 0,
  }

  if (!input.transcript.trim()) {
    return { ...baseResult, shouldIgnore: false, reason: 'no_transcript' }
  }

  if (!input.lastAssistantResponse?.trim()) {
    return { ...baseResult, shouldIgnore: false, reason: 'no_assistant_response' }
  }

  const nowMs = input.nowMs ?? Date.now()
  const maxEchoWindowMs = input.maxEchoWindowMs ?? DEFAULT_ECHO_WINDOW_MS
  if (
    input.playbackEndedAtMs == null ||
    nowMs - input.playbackEndedAtMs > maxEchoWindowMs
  ) {
    return { ...baseResult, shouldIgnore: false, reason: 'outside_echo_window' }
  }

  const minNormalizedLength = input.minNormalizedLength ?? DEFAULT_ECHO_MIN_NORMALIZED_LENGTH
  if (normalizedTranscript.length < minNormalizedLength) {
    return { ...baseResult, shouldIgnore: false, reason: 'too_short' }
  }

  const containmentMinLength = input.containmentMinLength ?? DEFAULT_ECHO_CONTAINMENT_MIN_LENGTH
  if (
    normalizedTranscript.length >= containmentMinLength &&
    normalizedAssistantResponse.includes(normalizedTranscript)
  ) {
    return { ...baseResult, shouldIgnore: true, reason: 'contained_in_assistant_response' }
  }

  const overlapMinLength = input.overlapMinLength ?? DEFAULT_ECHO_OVERLAP_MIN_LENGTH
  const overlapRatio = getCharacterRecall(normalizedTranscript, normalizedAssistantResponse)
  const overlapThreshold = input.overlapThreshold ?? DEFAULT_ECHO_OVERLAP_THRESHOLD
  if (
    normalizedTranscript.length >= overlapMinLength &&
    overlapRatio >= overlapThreshold
  ) {
    return {
      ...baseResult,
      overlapRatio,
      shouldIgnore: true,
      reason: 'high_overlap_with_assistant_response',
    }
  }

  return { ...baseResult, overlapRatio, shouldIgnore: false, reason: 'not_echo' }
}
