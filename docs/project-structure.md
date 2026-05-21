# Project Structure and Layering

## Goal

Keep the repository in one product workspace while making Web, API, shared business contracts, and future native mobile code clearly separated.

The current codebase is still a root-level Next.js app. Future native mobile work SHOULD follow `docs/native-mobile-architecture-plan.md` and add `apps/mobile` plus `packages/*` incrementally.

## Layering Rules

- `app/` holds pages and route handlers only.
- `components/` holds reusable UI only.
- `lib/client/` holds browser-only helpers and local UI state helpers if needed.
- `lib/server/` holds server-only business logic, provider orchestration, and request handlers.
- `lib/shared/` holds types, constants, and validation used by both sides.
- `apps/mobile/` will hold the Expo React Native native client after the mobile architecture probe starts.
- `packages/shared/` will hold cross-client types, scenarios, accents, and validation once extracted from current modules.
- `packages/api-client/` will hold typed API calls shared by Web and Mobile.
- `packages/session-core/` will hold platform-neutral session state and turn lifecycle rules.
- `supabase/` holds migrations and database setup only.
- `docs/` holds product, implementation, and operational docs only.

## Current Practical Mapping

- Frontend surface:
  - `app/*.tsx`
  - `components/*`
- Backend surface:
  - `app/api/*`
  - `lib/server/*`
  - `lib/supabase/*`
- Provider adapters:
  - `lib/providers/*`
- Shared surface:
  - `lib/i18n.ts`
  - `lib/scenarios.ts`
  - `lib/auth/*`
  - `lib/conversation-workflow.ts`

## Keep It Looking Split

- Page components should not hold provider logic.
- API routes should call provider and persistence helpers, not inline heavy logic.
- Keep AI orchestration in `lib/server/*`, not inside route handlers.
- Shared data contracts should live in `lib/shared` or current shared modules.
- Frontend settings should read/write through API routes, not direct database access.
- Secrets stay server-side only.
- Native mobile code must not import Web UI, Next route handlers, server-only providers, DOM APIs, or browser storage helpers.
- Cross-client code should move toward `packages/shared`, `packages/api-client`, and `packages/session-core` instead of being copied into `apps/mobile`.

## What Not to Do

- Do not move to a separate frontend repo just for cosmetic separation.
- Do not duplicate provider logic in page components.
- Do not put Supabase service-role usage in client code.
- Do not create a WebView shell as the mobile app; it would preserve the browser/WebKit limitations that native mobile is meant to avoid.
- Do not migrate the entire Web app into `apps/web` before the mobile architecture probe proves the shared boundaries.

## Migration Strategy

The clean path is incremental:

1. Add `packages/shared` for stable types/config that have no React/Next/server dependency.
2. Add `packages/api-client` so Mobile can call existing Next APIs without depending on Web internals.
3. Add `apps/mobile` as an Expo React Native native client probe.
4. Add `packages/session-core` and move platform-neutral turn lifecycle rules out of `VoiceSessionProvider`.
5. Move `app/` and `components/` to `apps/web` only after package boundaries are stable and the migration has clear value.
6. Keep Supabase migrations in place until the backend is fully replaced or intentionally extracted.
