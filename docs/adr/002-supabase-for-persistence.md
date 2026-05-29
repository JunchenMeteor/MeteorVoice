# ADR-002: Use Supabase for Auth and Persistence

## Status

Accepted

## Background

MeteorVoice needs user authentication, session history storage, and cross-device preference sync. The solution must be operable without a dedicated backend team and must support both Web and mobile clients.

## Decision

Use Supabase (PostgreSQL + Auth + Row Level Security) for all persistence and authentication.

## Rationale

- Provides auth, database, and RLS in one managed service with a generous free tier.
- The JavaScript client works in both Next.js (server and client) and Expo React Native without separate SDKs.
- RLS enforces data isolation at the database level, reducing the risk of accidental data leaks in API routes.
- Migrations are plain SQL files, easy to version and review.
- No need to build or maintain a separate auth service.

## Consequences

- All user data is stored in Supabase. If Supabase is unavailable, session history and preference sync are unavailable (voice sessions still work in degraded mode).
- Schema changes require SQL migrations committed to `supabase/migrations/`.
- Service role key must stay server-side only; never expose it to the client.
