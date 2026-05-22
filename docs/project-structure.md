# Project Structure and Layering

## Goal

Keep the repository in one product workspace while making Web, API, shared business contracts, and future native mobile code clearly separated.

The current codebase is a workspace with `apps/web`, `apps/mobile`, and shared `packages/*`. Future native mobile and Web changes SHOULD follow `docs/native-mobile-architecture-plan.md`.

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

## Keep It Looking Split

- Page components should not hold provider logic.
- API routes should call provider and persistence helpers, not inline heavy logic.
- Keep AI orchestration in `lib/server/*`, not inside route handlers.
- Shared data contracts should live in `lib/shared` or current shared modules.
- Frontend settings should read/write through API routes, not direct database access.
- Secrets stay server-side only.
- Native mobile code must not import Web UI, Next route handlers, server-only providers, DOM APIs, or browser storage helpers.
- Cross-client code should move toward `packages/shared`, `packages/api-client`, and `packages/session-core` instead of being copied into `apps/mobile`.

## Architecture Decisions and Future Directions

- **TTS/STT provider interfaces**: `TTSProvider`, `STTProvider`, `ttsProviderCapabilities`, and `supportsAccent` live in `packages/shared/src/speech.ts` and are available to both Web and Mobile. Concrete adapters (Tencent, Volcengine, Xunfei) remain in `apps/web/lib/providers/` as server-side implementations; Mobile calls them via API. To add a native or offline TTS implementation on Mobile, implement `TTSProvider` from `@meteorvoice/shared` directly in `apps/mobile` — no architecture change needed.
- **Background audio keep-alive**: iOS `AVAudioSession` management and Android `ForegroundService` are platform-specific and MUST live in `apps/mobile` only. Do not add background lifecycle logic to `packages/session-core` — that package stays platform-neutral.
- **i18n**: All UI string translations live in `packages/shared/src/i18n.ts` and are shared by Web and Mobile. Do not add translation strings directly in `apps/web` or `apps/mobile`.

## What Not to Do

- Do not move to a separate frontend repo just for cosmetic separation.
- Do not duplicate provider logic in page components.
- Do not put Supabase service-role usage in client code.
- Do not create a WebView shell as the mobile app; it would preserve the browser/WebKit limitations that native mobile is meant to avoid.
- Do not move Web files back to the repository root after the `apps/web` migration.

## Migration Strategy

The clean path is incremental:

1. Add `packages/shared` for stable types/config that have no React/Next/server dependency.
2. Add `packages/api-client` so Mobile can call existing Next APIs without depending on Web internals.
3. Add `apps/mobile` as an Expo React Native native client probe.
4. Add `packages/session-core` and move platform-neutral turn lifecycle rules out of `VoiceSessionProvider`.
5. Move `app/`, `components/`, `lib/`, Web config, and public assets to `apps/web`.
6. Keep Supabase migrations in place until the backend is fully replaced or intentionally extracted.
