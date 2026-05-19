# Project Structure and Layering

## Goal

Keep the repository in a single Next.js app while making it read like a frontend/backend split.

## Layering Rules

- `app/` holds pages and route handlers only.
- `components/` holds reusable UI only.
- `lib/client/` holds browser-only helpers and local UI state helpers if needed.
- `lib/server/` holds server-only business logic, provider orchestration, and request handlers.
- `lib/shared/` holds types, constants, and validation used by both sides.
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

## What Not to Do

- Do not move to a separate frontend repo just for cosmetic separation.
- Do not duplicate provider logic in page components.
- Do not put Supabase service-role usage in client code.

## Migration Strategy If You Split Later

If you ever want a real split, the clean next step is:

1. Move `app/` pages to `apps/web`.
2. Move `app/api/*` and `lib/providers/*` server code to `apps/api` or `packages/server`.
3. Move shared types and constants to `packages/shared`.
4. Keep Supabase migrations in place until the backend is fully replaced.
