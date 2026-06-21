# Project Structure and Layering

## Goal

Keep the repository in one product workspace while making Web, API, shared business contracts, and future native mobile code clearly separated.

The current codebase is a workspace with `apps/web`, `apps/mobile`, and shared `packages/*`. Future native mobile and Web productization changes SHOULD follow `docs/architecture-productization-roadmap.md`.

## Layering Rules

- `apps/web/app/` holds Next.js pages and route handlers only.
- `apps/web/components/` holds reusable Web UI only.
- `apps/web/lib/server/` holds server-only business logic, provider orchestration, and request handlers.
- `apps/web/lib/providers/` holds Web/API provider adapters.
- `apps/mobile/` holds the Expo React Native native client.
- `packages/shared/` holds cross-client types, scenarios, accents, and validation.
- `packages/api-client/` holds typed API calls shared by Web and Mobile.
- `packages/session-core/` holds platform-neutral session state and turn lifecycle rules.
- `supabase/` holds migrations and database setup only.
- `docs/` holds product, implementation, and operational docs only.

## Current Practical Mapping

- Frontend surface:
  - `apps/web/app/*.tsx`
  - `apps/web/components/*`
- Backend surface:
  - `apps/web/app/api/*`
  - `apps/web/lib/server/*`
  - `apps/web/lib/supabase/*`
- Provider adapters:
  - `apps/web/lib/providers/*`
- Shared surface:
  - `packages/shared/*` (includes i18n, locale, scenarios, speech, conversation types)
  - `packages/api-client/*`
  - `packages/session-core/*`
  - `apps/web/lib/auth/*`
- Shared runtime primitives:
  - `packages/shared/src/feedback.ts` owns platform-neutral app feedback state, source registry, severity, presentation, and displayable error bridging.
  - `packages/shared/src/operation-group.ts` owns grouped async task execution for page-level refreshes that need one loading surface across multiple API calls.

## Keep It Looking Split

- Page components should not hold provider logic.
- API routes should call provider and persistence helpers, not inline heavy logic.
- Resource-specific operations SHOULD use REST-style resource paths such as `/api/sessions/:sessionId`; broad legacy endpoints such as `/api/session?id=...` may stay only as temporary compatibility paths.
- Keep AI orchestration in `apps/web/lib/server/*`, not inside route handlers.
- Shared data contracts should live in `packages/shared`, `packages/api-client`, or `packages/session-core`.
- Frontend settings should read/write through API routes, not direct database access.
- Secrets stay server-side only.
- Native mobile code must not import Web UI, Next route handlers, server-only providers, DOM APIs, or browser storage helpers.
- Cross-client code should live in `packages/shared`, `packages/api-client`, and `packages/session-core` instead of being copied into `apps/mobile`.

## Productization Backlog

The current architecture skeleton is complete, but productization is not finished. Use `docs/architecture-productization-roadmap.md` for the next execution plan.

Highest-priority improvements:

- Clean remaining historical docs so only current paths guide AI work.
- Add workspace scripts for Web lint/build, Mobile config/typecheck, and package tests.
- Stabilize API DTOs for scenarios, accents, preferences, history, session turns, and review.
- Remove temporary compatibility paths after the replacement has been deployed on Vercel and Tencent for at least one stable observation window.
- Move more platform-neutral session transition rules into `packages/session-core`.
- Harden native mobile speech input, native playback, preferences sync, and audio QA.
- Upgrade accent support from provider labels to explicit voice profiles and capability matrix.

## Architecture Decisions and Future Directions

- **TTS/STT provider interfaces**: `TTSProvider`, `STTProvider`, `ttsProviderCapabilities`, and `supportsAccent` live in `packages/shared/src/speech.ts` and are available to both Web and Mobile. Concrete adapters (Tencent, Volcengine, Xunfei) remain in `apps/web/lib/providers/` as server-side implementations; Mobile calls them via API. To add a native or offline TTS implementation on Mobile, implement `TTSProvider` from `@meteorvoice/shared` directly in `apps/mobile` — no architecture change needed.
- **Session orchestration**: `packages/session-core` owns platform-neutral turn rules and effect decisions: transcript acceptance, request/receive coach reply, playback completion, playback queue advancement, pause/resume, error recovery, and end-session transitions. Web and Mobile should translate platform events into these helpers, then execute returned effects in their own adapters. Do not put Browser Speech, Web Audio, Expo Audio, native permissions, fetch calls, DOM storage, or UI state in `packages/session-core`.
- **Background audio keep-alive**: iOS `AVAudioSession` management and Android `ForegroundService` are platform-specific and MUST live in `apps/mobile` only. Do not add background lifecycle logic to `packages/session-core` — that package stays platform-neutral.
- **i18n**: All UI string translations live in `packages/shared/src/i18n.ts` and are shared by Web and Mobile. Do not add translation strings directly in `apps/web` or `apps/mobile`.
- **App feedback and loading**: Shared feedback state lives in `packages/shared/src/feedback.ts`. Web renders it through `apps/web/components/AppFeedbackPresenter.tsx`; Mobile renders it through `apps/mobile/src/components/AppFeedbackOverlay.tsx`. Page-level multi-request loading should use `runAppOperationGroup()` from `packages/shared/src/operation-group.ts` instead of local overlapping loading overlays.
- **Settings synchronization**: Settings page entry, login, foreground resume, and manual reload MAY use grouped full refresh. A single preference save MUST use the PATCH response from `/api/preferences` and apply only affected fields. Do not follow a successful single setting PATCH with a full `GET /api/preferences` unless the server contract changed and the entire settings cache must be rebuilt.
- **Compatibility cleanup**: Track and remove legacy `theme_preferences` product-preference fallback after `user_preferences` migration is confirmed in production, both deployments have run the new code, and preference errors stay clean for about 7 days. Track and remove legacy `DELETE /api/session?id=...` after Web, Mobile, and API client consumers have all shipped `DELETE /api/sessions/:sessionId` for the same observation window.
- **Response language routing**: Web and Mobile pass `responseLocale` in `ConversationContext` to `/api/chat`; server-side AI reply and correction generation honor that locale. ASR language mode remains a separate speech-recognition concern and MUST NOT be used as a substitute for response language.

## What Not to Do

- Do not move to a separate frontend repo just for cosmetic separation.
- Do not duplicate provider logic in page components.
- Do not put Supabase service-role usage in client code.
- Do not create a WebView shell as the mobile app; it would preserve the browser/WebKit limitations that native mobile is meant to avoid.
- Do not move Web files back to the repository root after the `apps/web` migration.

## Migration Status

The Web migration is complete on `main`. The historical incremental path was:

1. Add `packages/shared` for stable types/config that have no React/Next/server dependency.
2. Add `packages/api-client` so Mobile can call existing Next APIs without depending on Web internals.
3. Add `apps/mobile` as an Expo React Native native client probe.
4. Add `packages/session-core` and move platform-neutral turn lifecycle rules out of `VoiceSessionProvider`.
5. Move `app/`, `components/`, `lib/`, Web config, and public assets to `apps/web`. Completed.
6. Keep Supabase migrations in place until the backend is fully replaced or intentionally extracted.

New work MUST not recreate root-level Web app directories. Use `docs/architecture-productization-roadmap.md` for the next productization phases.
