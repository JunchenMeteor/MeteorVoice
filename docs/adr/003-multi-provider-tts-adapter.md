# ADR-003: Multi-Provider TTS Adapter Layer

## Status

Accepted

## Background

No single TTS provider covers all requirements: domestic providers (Xunfei, Volcengine, Tencent) have better availability in China but limited accent support; Azure Neural TTS covers all accents but requires a credit card to activate. Users need to choose a provider based on their region and account setup.

## Decision

Implement a `TTSProvider` interface in `packages/shared` and a separate adapter file per provider in `apps/web/lib/providers/`. The active provider is selected at runtime based on user preference stored in Supabase.

## Rationale

- Adding a new provider requires one new file and one line in the factory function — no changes to the session or API layer.
- Provider credentials stay in server-side environment variables; the client only sends the provider name.
- Users can switch providers in Settings without redeploying.
- Mock provider enables full local development without any API keys.

## Consequences

- Each provider has different accent support. The `ttsProviderCapabilities` map in `packages/shared/src/speech.ts` gates which accents are available per provider.
- Provider-specific voice IDs (e.g. Xunfei V3 `vcn`) must be configured separately and are not portable across providers.
- If the selected provider is not configured on the server, the app falls back to mock TTS silently.
