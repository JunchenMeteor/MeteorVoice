# Supabase Setup

## What Is Already There

- `supabase/migrations/001_init.sql` creates the core schema and seed data.
- `supabase/migrations/002_rls.sql` enables row-level security and user-owned access policies.
- `supabase/migrations/003_tts_preferences.sql` adds the per-user TTS provider preference.
- `supabase/migrations/004_productized_preferences.sql` adds locale, default scenario/accent, and TTS speed preferences for Web/Mobile sync.
- `supabase/migrations/005_tts_voice_preferences.sql` adds the selected TTS coach voice id.
- `supabase/migrations/008_voice_profile_preferences.sql` adds the provider-neutral coach voice profile catalog, stores `selected_voice_profile_id`, and removes `default_accent_key`.
- The app uses Supabase Auth with a MeteorTest-style username/phone account input.

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
4. Run `003_tts_preferences.sql`.
5. Run `004_productized_preferences.sql`.
6. Run `005_tts_voice_preferences.sql` through `008_voice_profile_preferences.sql`.
7. Copy the project URL and anon key into `apps/web/.env.local` for Web/API local development and `apps/mobile/.env` using Expo's `EXPO_PUBLIC_*` names for mobile builds.
8. Set Authentication redirect URLs for local development.

## What the RLS Policies Do

- Logged-in users can only read and write their own sessions.
- Turns and correction items are only accessible through the owner session.
- Learning history and theme preferences are user-scoped.
- The selected TTS provider is stored on `theme_preferences.tts_provider` and protected by the same user-owned policy.
- Locale, default scenario, TTS speed, TTS provider, selected voice profile id, and provider voice id are stored on `theme_preferences` and protected by the same user-owned policy.
- Coach voice catalog rows are stored on `tts_voice_profiles` and readable by anon/authenticated clients through the server API.
- Accent profiles and scenarios are readable by authenticated users.

## Coach Voice Profiles

`tts_voice_profiles` is the editable catalog for all provider voices. Insert one row per voice. Use `provider_voice_id` for the value required by the provider API, and use `display_name`, `display_name_zh`, `gender`, `style`, `quality_tier`, `status`, and `expires_at` for UI and availability.

`accent_key`, `accent_label`, and `accent_region` are metadata on the voice profile. They are not a separate user preference.

## Notes on Admin Accounts

For local testing, you can create a user in Supabase Auth manually and then map the profile fields afterward.
For username-based login, keep the username in app-side metadata or a profile table rather than expecting Supabase to treat it as the primary auth identifier.
