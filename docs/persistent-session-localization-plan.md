# Persistent Voice Session and Localization Plan

## Goals

- Keep an active voice conversation's state alive while users navigate between app pages.
- Pause microphone listening when users leave `/session`, then resume listening when they return to `/session`.
- Preserve clear recording, speaking, and paused indicators everywhere in the app.
- Avoid silent background microphone listening outside the dedicated conversation page.
- Localize scenario, accent, difficulty, status, and navigation-facing copy consistently.
- Keep the implementation small enough to review safely by splitting it into staged PRs.

## Current Gaps

- `SessionPageClient` owns the voice loop, messages, status, corrections, active turn refs, and TTS preference state. Navigating away from `/session` unmounts it, so the active conversation is lost.
- `Sidebar` currently protects accidental navigation, but it does not preserve the session state after navigation.
- Scenario names use `name` and `nameZh`, while descriptions and difficulty labels stay English-only.
- Accent descriptions and some provider-facing labels are not localized.
- Session route query params hold scenario/accent selection, but the app has no global session store that other pages can read.
- Browser microphone and audio playback behavior must remain explicit: the app should not record unless a user has started an active session and is currently on `/session`.

## Proposed Architecture

### 1. Localized Content Model

Move scenario and accent display copy to locale-aware fields or translation keys.

- Replace direct `name`, `nameZh`, and `description` rendering with helpers such as `getScenarioLabel(scenario, locale)` and `getScenarioDescription(scenario, locale)`.
- Add localized difficulty labels instead of rendering raw enum values.
- Keep stable scenario keys unchanged so history, URLs, and persisted data do not break.
- Update home, session, history, review, and summary-facing screens to display localized labels.

### 2. Global Session Provider

Create a client provider mounted in `app/layout.tsx` under `LanguageProvider`.

Provider responsibilities:

- Own active session state: scenario key, accent key, messages, status, corrections, summary, current workflow snapshot, active turn id, provider preference, and route-level paused state.
- Expose actions: `startSession`, `endSession`, `pauseListeningForNavigation`, `resumeListeningOnSessionRoute`, `continueTurn`, `playCorrection`, and `selectScenario`.
- Keep refs used by async voice turns inside the provider so they survive route changes.
- Publish whether recording, speaking, or paused-with-active-session is active for global UI indicators.

### 3. Session Engine Extraction

Extract the turn loop out of `app/session/SessionPage.tsx` into a hook or provider module.

The engine should:

- Listen, transcribe, call chat, play TTS, append assistant messages, and automatically start the next turn only while the user remains on `/session`.
- Pause microphone listening immediately when the current route leaves `/session`.
- Resume the next listening turn when the user returns to `/session` and the session is still active.
- Stop immediately when `endSession` is called.
- Prevent overlapping turns with the existing `activeTurnRef` pattern.
- Use configured TTS provider preferences before the first turn starts.
- Keep corrections non-blocking in the right-side list.

### 4. Persistent UI Surfaces

Keep `/session` as the full conversation screen, but add global affordances when users are on other pages.

- Sidebar: show active session status and a compact return-to-session action.
- Layout-level mini controller: show current scenario, paused state, Return to Session, and End Session.
- Non-session pages: do not show full transcript by default, and do not keep the microphone listening in the background.
- Leaving the site or closing the tab: use browser confirmation only while the session is active.

### 5. Navigation Behavior

Expected behavior after the feature:

- Clicking Home, Review, History, or Settings does not end the active conversation.
- Clicking Home, Review, History, or Settings pauses microphone listening and keeps transcript, corrections, scenario, accent, and turn state in memory.
- Returning to `/session` resumes the next listening turn for the same conversation.
- The user can return to `/session` and see the same transcript, corrections, status, and controls.
- Ending the session from any page stops STT/TTS work and saves history/summary once.

## Implementation Stages

### Stage 1: Scenario and Accent Localization

- Refactor `lib/scenarios.ts` to support localized labels and descriptions.
- Add locale helpers and difficulty labels.
- Update home and session pages to use localized copy.
- Add tests for localized scenario helper fallback behavior.

### Stage 2: Global Session State Skeleton

- Add `components/VoiceSessionProvider.tsx` or `lib/session/VoiceSessionProvider.tsx`.
- Move session state and public actions into the provider without changing behavior.
- Wrap the app in the provider from `app/layout.tsx`.
- Update `/session` to consume provider state and actions.

### Stage 3: Route-Aware Persistent Voice Loop

- Move the async turn loop into the provider or a provider-owned hook.
- Keep session state alive across route changes.
- Pause any active STT/listening operation when leaving `/session`.
- Resume listening when returning to `/session` if the session is still active.
- Add tab close confirmation while recording or speaking.
- Ensure `endSession` cancels pending turns, stops listening, and does not double-save.

### Stage 4: Global Active Session UI

- Replace the current sidebar-only leave confirmation with a compact active-session indicator.
- Add return-to-session and end-session controls outside `/session`.
- Keep the full correction sidebar only on `/session`.

### Stage 5: Regression Coverage and Manual QA

- Add unit tests for localization helpers.
- Add provider-level tests for start/end state transitions where practical.
- Manually verify:
  - Start a session, AI replies, app automatically listens again.
  - Navigate to Home/Settings and confirm microphone listening pauses while transcript is preserved.
  - Return to Session and confirm listening resumes for the same conversation.
  - End session from non-session page.
  - Locale switch updates scenario and accent display copy.
  - Xunfei TTS remains selected when configured.

## Risks and Constraints

- Browser STT implementations may stop when the tab loses focus, route changes, or permissions change. The UI should show a recoverable paused/error state instead of pretending the app is still listening.
- Browser audio playback may require a user gesture. Starting the session remains the user gesture that unlocks playback.
- Persisting in-memory conversation state across routes is realistic. Persisting across full page reloads is a separate feature and should not be mixed into the first global-session PR.
- The app must continue to avoid hidden recording. Every active recording state needs an obvious global indicator.

## Recommended PR Split

1. `[Feature] Localize scenario and accent content`
2. `[Feature] Add global voice session provider`
3. `[Feature] Pause and resume voice sessions across navigation`
4. `[Feature] Add global active session controls`
