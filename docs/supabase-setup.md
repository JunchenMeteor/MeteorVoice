# Supabase Setup

## What Is Already There

- `supabase/migrations/001_init.sql` creates the core schema and seed data.
- `supabase/migrations/002_rls.sql` enables row-level security and user-owned access policies.
- The app currently uses Supabase Auth through the standard email/password flow.

## Username + Phone Login Mode

MeteorVoice follows the MeteorTest pattern:

1. Accept one account field in the UI.
2. Parse it as either `username` or `phone`.
3. Convert `username` to an internal email alias, such as `alex@users.meteorvoice.local`.
4. Pass `phone` directly to Supabase phone auth.
5. Store username metadata in auth user data for profile sync.

This gives you a single login surface with two formal account types:

- `username + password`
- `phone + password`

### Recommended setup

- Keep `username` as profile data and use a fixed alias domain for internal auth emails.
- Do not expose the alias email in the UI.
- Keep phone login direct.

### Production recommendation

- Treat username as a real account identifier at the UI layer, backed by an internal email alias.
- Keep phone as the native Supabase identity path.

## How to Configure Supabase

1. Create a Supabase project.
2. Run `001_init.sql`.
3. Run `002_rls.sql`.
4. Copy the project URL and anon key into `.env.local`.
5. Set Authentication redirect URLs for local development.

## What the RLS Policies Do

- Logged-in users can only read and write their own sessions.
- Turns and correction items are only accessible through the owner session.
- Learning history and theme preferences are user-scoped.
- Accent profiles and scenarios are readable by authenticated users.

## Notes on Admin Accounts

For local testing, you can create a user in Supabase Auth manually and then map the profile fields afterward.
For username-based login, keep the username in app-side metadata or a profile table rather than expecting Supabase to treat it as the primary auth identifier.
