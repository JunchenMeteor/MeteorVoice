# Voice Profile Unification Plan

Status: planned. This document records the follow-up product direction only; it is not implemented in the 2026-05-29 mobile bugfix pass.

## Problem

MeteorVoice currently treats provider voice selection unevenly:

- Xunfei exposes a visible voice catalog and lets users choose a concrete voice ID.
- Azure supports many Neural TTS voices, but the app currently maps accent to a default Azure voice internally.
- Mobile and Web settings should not grow separate provider-specific voice pickers.

This creates confusing behavior: users can choose a "coach voice" for Xunfei but not for Azure, even though Azure also has voice names.

## Product Direction

Introduce a provider-neutral `VoiceProfile` model and a unified "coach voice" picker.

The UI should let users choose a human-readable coach voice, not a provider-specific implementation detail.

Default accent should be deprecated as a standalone user-facing setting once `VoiceProfile` exists. Accent remains useful as metadata for search, filtering, AI context, and provider capability checks, but the user's primary choice should be the coach voice. Until the unified UI ships, keep `default_accent_key` for compatibility with current API contracts and provider mappings.

## Proposed Model

```ts
type VoiceProfile = {
  id: string
  provider: 'xunfei' | 'azure' | 'mock' | 'volcengine' | 'tencent'
  providerVoiceId: string
  displayName: string
  locale: 'en' | 'zh'
  accentKey: string
  gender?: 'male' | 'female'
  style?: string
  qualityTier?: 'base' | 'featured'
  expiresAt?: string
  status: 'active' | 'expired' | 'unavailable'
  supportedSpeeds?: number[]
}
```

## API Direction

Add a stable server capability endpoint or extend preferences response with:

- available providers
- available voice profiles
- selected voice profile
- disabled/unavailable reason

The client should not hard-code provider catalogs. Provider-specific mapping should stay on the server.

## UI Direction

Web and Mobile should share the same user-facing structure:

- TTS provider selection.
- Current coach voice summary.
- Voice profile picker filtered by selected provider/accent.
- Clear unavailable/expired state.
- No separate default-accent picker once voice profiles fully replace provider-specific voice selection; accent should be derived from the selected profile or used only as a filter.

Provider-specific implementation details such as Xunfei `vcn` or Azure Neural voice name should remain secondary metadata.

## Azure Notes

Azure has concrete Neural voice names. Current code maps accent to defaults such as:

- American: `en-US-JennyNeural`
- British: `en-GB-SoniaNeural`
- Australian: `en-AU-NatashaNeural`
- Indian: `en-IN-NeerjaNeural`
- Singapore: `en-SG-LunaNeural`
- African: `en-ZA-LeahNeural`

These should become server-owned `VoiceProfile` entries before exposing Azure voice choice in the app.

## Non-Goals For Current Bugfix

- Do not implement the unified UI in this pass.
- Do not add Azure-specific picker UI as a one-off.
- Do not move provider secrets or server-only catalog logic into Mobile.

## Acceptance Criteria For Future Work

- Web and Mobile show the same selected coach voice for the same account.
- Xunfei and Azure voices appear through one UI model.
- Selecting a voice updates server preferences when signed in and remains locally usable before sync.
- Unavailable or expired voices are visible but not selectable.
- TTS requests use the selected profile's provider voice ID.
