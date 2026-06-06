# Session Runtime Redesign

This document is the baseline design for the MeteorVoice mobile voice-loop refactor. It exists so implementation can be compared against an explicit runtime model instead of incremental boolean fixes.

## Problem Statement

The current mobile voice loop mixes route state, session state, STT state, playback state, request state, and teardown state across many refs and React state values. Recent device logs showed two concrete failures:

- The UI had already navigated back to Practice, but STT startup still read the previous tab (`settings` or `home`) and aborted.
- A user transcript reached `submit_turn_start`, but no `submit_turn_done`, `submit_turn_error`, or timeout log followed, leaving the user with no visible recovery path.

The immediate bug is code robustness, but the root cause is an unclear runtime model. Page navigation, session lifecycle, STT stream lifecycle, AI request lifecycle, and playback lifecycle must be separated.

## Product Model

MeteorVoice should treat a practice session as a durable session instance:

```text
Session Instance: one continuous practice conversation
Scenario: the prompt/context selected for that session instance
Route Presence: whether the user is currently viewing the Practice tab
STT Stream: one short provider recognition stream for one listening window
```

Rules:

- Leaving the Practice tab does not end the session.
- Leaving the Practice tab pauses microphone listening.
- Returning to the Practice tab resumes listening if the session is still active and nothing else is busy.
- Selecting the same scenario while a session is active should return to Practice.
- Selecting a different scenario while a session is active should confirm with the user before ending the old session and starting a new one.
- Scenario should be fixed for a session instance. Changing scenario is a new session, not only a prompt mutation inside the old session.

## Runtime State

Target runtime shape:

```text
SessionRuntime
├─ lifecycle: idle | active | paused | ending | ended | error
├─ activity: none | preparingStt | listening | submitting | replying | preparingPlayback | playing
├─ routePresence: inSession | outSession
├─ sessionId
├─ scenarioKey
├─ generation
├─ currentTurnId
├─ messages
├─ sttRuntime
├─ playbackRuntime
└─ requestRuntime
```

`routePresence` deliberately uses `inSession | outSession`. It is a runtime concept, not a React navigation implementation detail.

## STT Runtime

Xunfei IAT/zh_iat is a short stream, not a permanent session socket. The downloaded `iat_ws_python3_demo` and `iat-js-demo` both generate a signed WebSocket URL, open a socket, send `first / continue / last` audio frames, then close after final recognition. The JS demo starts recorder capture after `onopen`, sends `status: 0` first, then `status: 1`, and sends `status: 2` on recorder stop. It closes the WebSocket after final `data.status === 2`.

Xunfei docs and demos imply:

- One user utterance should be treated as one STT stream.
- A long-lived app session should not rely on a permanently open Xunfei WebSocket.
- Closing/reopening is normal, but it must be serialized and protected from stale callbacks.

Target STT runtime:

```text
SttRuntime
├─ state: idle | bootstrapping | ready | recording | finalizing | stopping | failed
├─ streamId
├─ generation
├─ operationQueue
├─ lastPartial
├─ startedAt
├─ stoppedPromise
└─ retryCount
```

Rules:

- STT `start` and `stop` must be serialized through one operation queue.
- `stop` must settle by `socket_closed`, `pcm_stopped`, `already_idle`, or timeout.
- `start` must wait for prior stop to settle before opening a new stream.
- Every STT callback must compare both `streamId` and `generation`.
- Stale callbacks must log `stt_callback_ignored` and must not mutate session state.
- Restart debounce should be short (`100-300ms`) after forced stop to let iOS audio and WebSocket teardown settle.
- `start` should have a no-frame timeout and at most one controlled recovery path. It must not spin in a loop.

## Xunfei Auth URL Cache Position

The Xunfei URL is signed with `host`, `date`, and `request-line`. A signed URL is time-sensitive. The demos generate a fresh URL per WebSocket connection and do not demonstrate safe reuse.

Official documentation for the voice dictation WebAPI describes the connection as a WebSocket audio session: connect, upload audio frames, send the ending status, receive the final status, and close. It also documents connection-level limits such as the signed `date` tolerance window, maximum session duration, and idle audio timeout. Those limits apply to a WebSocket session, not to the MeteorVoice practice session.

Local diagnostic on 2026-06-06:

```text
same-url-first-use   open=true, providerCodes=0/0, providerStatuses=0/2, providerMessages=success/success
same-url-second-use  open=true, providerCodes=0/0, providerStatuses=0/2, providerMessages=success/success
fresh-url-control    open=true, providerCodes=0/0, providerStatuses=0/2, providerMessages=success/success
```

This proves the signed WebSocket URL is not consumed by the first successful connection within the signature time window. It does not prove that the URL should be treated as a durable credential or that a single WebSocket can span multiple user turns.

Implementation policy:

- Cache stable provider configuration (`appId`, audio format, frame size, sample rate, eos) freely.
- Cache signed endpoint URLs only as a short-lived optimization inside the server process.
- Reusing a signed URL for rapid retries is acceptable within the provider's time window, but each listening window still creates a new WebSocket stream.
- Keep `expiresAt` conservative. A generated URL may remain valid for several minutes, but stream state must never be reused across utterances.
- Never expose `apiSecret` or signing inputs to mobile. Mobile receives only the signed WebSocket URL and non-secret provider configuration.
- The current server cache is process-local, has a four-minute TTL, and refreshes before expiry. It improves repeated bootstrap latency without changing client permissions.

This avoids leaking provider secrets to mobile while preventing unnecessary server-side recomputation during rapid retries.

## Playback Tail Prewarm

The next STT stream may be prewarmed near the end of coach playback, but microphone capture must not begin until playback has finished. This keeps coach audio from being captured while reducing the perceived delay before listening resumes.

Prewarm rules:

- Prewarm creates the next `streamId`; it is not attached to the previous user turn.
- The prewarmed stream opens the provider WebSocket and waits.
- When playback finishes, normal resume logic consumes the prewarmed stream by starting PCM capture on that same `streamId`.
- If the route changes, session generation changes, playback does not finish, or the stream is not consumed quickly enough, the prewarmed stream is closed.
- Short replies should not prewarm. The window is adaptive: replies shorter than about 1.8 seconds skip prewarm; longer replies use a bounded window based on duration.

## Conversation Turn Runtime

Every user utterance becomes a turn:

```text
STT_FINAL(transcript)
-> ENDPOINT_START
-> ENDPOINT_DONE
-> SUBMIT_TURN_START
-> COACH_REPLY_READY
-> TTS_READY
-> PLAYBACK_ENQUEUED
-> PLAYBACK_STARTED
-> PLAYBACK_FINISHED
-> RESUME_STT
```

All async work must have explicit completion logs:

```text
*_start
*_done
*_error
*_timeout
*_cancelled
*_ignored_stale
```

No async phase may log only `start` without a terminal log.

## Runtime Logging Contract

Every mobile runtime log emitted through `logVoiceMetric` must carry enough context to reconstruct a full session chain from one exported diagnostics file.

Common fields:

```text
traceId
metricSeq
sessionId
generation
streamId
turnRequestId
endpointRequestId
activeTab
routePresence
status
workflowState
scenario
sessionActive
canListenOnRoute
busy
playbackActive
audioPlaying
sttProvider
```

`traceId` is derived from `sessionId`, `generation`, and `turnRequestId`. `metricSeq` is monotonic in the current app process and should be used with `ts` to order tightly spaced events.

UI state changes are logged as first-class runtime events:

```text
ui_status_changed
ui_busy_changed
tab_change
route_presence_changed
```

STT, endpoint, submit, TTS, playback, and route changes should be searchable as one chain by filtering on `traceId`, then sorting by `metricSeq`.

## Generation And Turn Guards

`generation` is incremented when a session starts, stops, or changes scenario. Async callbacks must capture generation at start and compare at completion.

```text
if callback.generation !== runtime.generation:
  ignore
```

`turnRequestId` remains the request-level guard for a single turn. It should be combined with `generation` so an old request cannot write to a new session.

## Five-Phase Implementation Plan

### P1 - Runtime State And Route Presence

- Add `routePresenceRef` with values `inSession | outSession`.
- Update route presence synchronously before triggering side effects.
- Stop using stale `activeTab` as the hard gate for STT.
- Keep active session alive across tab changes.
- Implementation: `apps/mobile/src/sessionRuntime.ts` owns `SessionRoutePresence`, `routePresenceForTab`, and listening selectors. `App.tsx` updates route presence before side effects.

### P2 - STT Runtime Queue

- Add a serialized STT operation queue.
- Add `streamId` and `generation` to Xunfei stream state.
- Add bounded stop settlement and restart debounce.
- Ignore stale socket/PCM callbacks.
- Implementation: `XunfeiSessionSttState`, `enqueueRuntimeOperation`, stopped signals, stream guards, restart debounce, and prewarm lifecycle are in runtime modules and consumed by `App.tsx`.

### P3 - Request And Playback Closure

- Add `submit_turn_done`, `submit_turn_error`, `submit_turn_timeout`, and stale/cancel logs.
- Ensure chat, semantic endpoint, TTS, and playback transitions are all bounded by timeout or cancellation.
- Stop playback immediately on session stop.
- Implementation: `apps/mobile/src/sessionTurnRuntime.ts` owns turn stale checks, endpoint writeback checks, and terminal error classification. Playback resume uses selectors instead of inline route/busy checks.

### P4 - Scenario Switching Contract

- Same scenario while active: navigate to Practice and keep the session.
- Different scenario while active: require user confirmation before ending old session and starting the new one.
- New session gets a new generation and clean messages.
- Implementation: `shouldConfirmScenarioSwitch` defines the confirmation contract. Confirmed scenario replacement increments generation, cancels STT/request/playback state, and creates a clean snapshot.

### P5 - Selector Cleanup

- Move UI decisions toward runtime selectors:
  - `canStart`
  - `canStop`
  - `isListening`
  - `isSubmitting`
  - `isPlaying`
  - `statusText`
- Avoid reintroducing page-level boolean combinations such as `sessionActive && activeTab === 'session' && !busy && !audioPlaying`.
- Implementation: listening gates, route presence, playback resume, playback-tail prewarm, scenario confirmation, endpoint writeback, and turn stale checks now go through runtime selectors/helpers. Remaining direct UI state reads in `App.tsx` are glue for screen rendering and settings/history workflows.

## Acceptance Checks

- Start a session from Home and speak the first utterance without opening Settings first.
- Switch Practice -> Settings -> Practice during an active session; STT should resume.
- Switch Practice -> Home -> Practice during an active session; STT should resume.
- Stop during playback; playback stops immediately.
- Stop during submitting/replying; old request cannot update the ended session.
- Xunfei socket close from an old stream cannot abort a newer stream.
- Logs show terminal events for STT, endpoint, submit, TTS, and playback.
- `routePresence` logs show `inSession` or `outSession`; no runtime decision depends solely on stale `activeTab`.
