# MeteorVoice Product Optimization Plan

## Goals

Make MeteorVoice feel like a real learning product rather than a technical demo.

The product must avoid exposing implementation details such as database IDs, internal email aliases, relation IDs, or session UUIDs in user-facing UI. User-facing surfaces should use real-world display names, localized labels, scenario names, accent names, provider names, and readable status text.

## Phase 1: Conversation and Correction UX

Status: in progress in `dev/audit/project-bug-sweep`.

1. Keep the voice conversation flowing after every AI reply.
2. Move correction feedback into a dedicated right-side panel on desktop and a lower panel on small screens.
3. Accumulate corrections as a session list instead of replacing the conversation controls.
4. Allow users to inspect and replay correction suggestions without blocking the next turn.
5. Keep session history and review backed by real correction items whenever available.

Acceptance checks:

- A correction from the AI does not hide the mic/continue control.
- The conversation returns to the normal idle/tap-mic state after the AI finishes speaking.
- The correction list remains visible during the session.
- Ending the session saves all accumulated corrections.

Current implementation notes:

- Correction feedback has been moved out of the blocking bottom card into a dedicated session panel.
- Corrections accumulate during the session and are saved with local history.
- The voice conversation can continue after corrections are shown.

## Phase 2: Identity and Display Names

Status: in progress in `dev/audit/project-bug-sweep`.

1. Add one display helper for Supabase users, for example `getUserDisplayName(user)`.
2. Prefer `user_metadata.display_name`, then `user_metadata.username`, then a masked phone or public email.
3. Never show internal username alias emails such as `@users.meteorvoice.local`.
4. Use the helper in Sidebar, Home, Settings, and any future profile surfaces.
5. Remove duplicate auth UI from the Home page and use `/login` as the only auth entry.

Acceptance checks:

- Sidebar shows a real display name or username.
- Internal alias domains never appear in the UI.
- Home does not contain a second inconsistent email-only login form.

Current implementation notes:

- `lib/auth/display.ts` centralizes user display-name formatting.
- Internal username alias emails are filtered out of visible identity display.
- The Home page no longer contains a duplicate email-only auth form.

## Phase 3: User-Facing Data View Models

Status: recommended follow-up branch.

Suggested branch: `dev/fix/user-facing-view-models`.

Suggested issue title: "Hide internal database identifiers from user-facing views".

1. Keep database IDs inside API/server logic.
2. Convert session/history/review API responses into view models with readable fields.
3. Use scenario names, localized status labels, accent names, and provider labels.
4. Keep raw IDs only as hidden operation keys when strictly needed.

Acceptance checks:

- History and review pages show readable names and localized statuses.
- No visible UUIDs or relation IDs appear in the normal product UI.

## Phase 4: Localization Completion

Status: started in `dev/audit/project-bug-sweep`; recommended follow-up branch for full sweep.

Suggested branch: `dev/fix/i18n-hardcoded-copy`.

Suggested issue title: "Complete localization coverage for visible UI copy".

1. Move all visible strings into `lib/i18n.ts`.
2. Add format helpers for status, correction type, provider label, date, and auth messages.
3. Replace hardcoded English strings in Login, Home, Review, History, and Session pages.
4. Map Supabase/auth errors to localized user-facing messages where practical.

Acceptance checks:

- `rg` finds no obvious hardcoded UI strings in app pages.
- Correction types and statuses are localized.
- Login success/error guidance is localized.

## Phase 5: Reliability and Polish

Status: recommended follow-up branch after the UX and i18n changes are merged.

Suggested branch: `dev/fix/session-reliability-polish`.

Suggested issue title: "Improve microphone, TTS fallback, and repeated-turn reliability".

1. Make mic permission and STT failure states explicit.
2. Avoid concurrent active turns from repeated clicks.
3. Keep TTS fallback visible but non-disruptive.
4. Add focused tests for workflow transitions, identity display helpers, and local history parsing.
5. Use Playwright/manual screenshots for key desktop/mobile surfaces before release.
