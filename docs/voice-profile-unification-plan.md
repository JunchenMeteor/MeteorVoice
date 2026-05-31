# Voice Profile Unification Plan

Status: in progress. The implementation is moving Web and native Mobile from standalone default accent settings to a provider-neutral coach voice model.

## Problem

MeteorVoice currently treats provider voice selection unevenly:

- Xunfei exposes a visible voice catalog and lets users choose a concrete voice ID.
- Azure supports many Neural TTS voices, but the app currently maps accent to a default Azure voice internally.
- Mobile and Web settings should not grow separate provider-specific voice pickers.

This creates confusing behavior: users can choose a "coach voice" for Xunfei but not for Azure, even though Azure also has voice names.

## Product Direction

Introduce a provider-neutral `VoiceProfile` model and a unified "coach voice" picker.

The UI should let users choose a human-readable coach voice, not a provider-specific implementation detail.

Default accent is no longer a standalone user-facing setting. Accent remains metadata on each `VoiceProfile` for AI context, filtering, and provider fallback, but the user's primary choice is the coach voice.

## Proposed Model

```ts
type VoiceProfile = {
  id: string
  provider: 'xunfei' | 'azure' | 'mock' | 'volcengine' | 'tencent'
  providerVoiceId: string
  displayName: string
  displayNameZh?: string
  description?: string
  descriptionZh?: string
  locale: 'en' | 'zh'
  accentKey: string
  accentLabel?: string
  accentRegion?: string
  gender?: 'male' | 'female'
  style?: string
  qualityTier?: 'base' | 'featured'
  expiresAt?: string
  status: 'active' | 'expired' | 'unavailable'
  supportedSpeeds?: number[]
}
```

## Database Direction

`tts_voice_profiles` is the configuration center for coach voices. One row represents one selectable voice. A provider can have many rows.

Core fields:

- `provider`: `mock`, `xunfei`, `volcengine`, `tencent`, or `azure`.
- `provider_voice_id`: the provider-specific voice id passed to the TTS API.
- `display_name`, `display_name_zh`, `description`, `description_zh`: user-facing profile copy.
- `locale`, `gender`, `style`, `quality_tier`: voice attributes shown in Settings.
- `accent_key`, `accent_label`, `accent_region`: internal/product metadata for AI context and fallback, not a separate preference.
- `status`, `expires_at`, `sort_order`: availability and ordering.

To add a new Azure, Xunfei, Tencent, or Volcengine voice later, insert a row in this table. Web and Mobile should not require code changes for catalog updates.

`theme_preferences.selected_voice_profile_id` stores the user's selected voice profile. `default_accent_key` is removed by the voice profile migration.

## API Direction

Add a stable server capability endpoint or extend preferences response with:

- available providers
- available voice profiles
- selected voice profile id
- disabled/unavailable reason

The client should not hard-code provider catalogs. Provider catalogs are read from `tts_voice_profiles` through the server API.

## UI Direction

Web and Mobile should share the same user-facing structure:

- TTS provider selection.
- Current coach voice summary.
- Voice profile picker filtered by selected provider.
- Clear unavailable/expired state.
- No separate default-accent picker once voice profiles fully replace provider-specific voice selection; accent should be derived from the selected profile or used only as a filter.

Provider-specific implementation details such as Xunfei `vcn` or Azure Neural voice name remain database metadata, not hard-coded mobile data.

## Acceptance Criteria For Future Work

- Web and Mobile show the same selected coach voice for the same account.
- Xunfei and Azure voices appear through one UI model.
- Selecting a voice updates server preferences when signed in and remains locally usable before sync.
- Unavailable or expired voices are visible but not selectable.
- TTS requests use the selected profile's provider voice ID.
