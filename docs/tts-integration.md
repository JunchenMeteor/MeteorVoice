# TTS Integration Guide

## Current Direction

For users in China, use domestic TTS providers first:

1. Xunfei
2. Volcengine
3. Tencent Cloud

For full accent coverage (British, Australian, Indian, Singapore, African), use Azure Neural TTS. It has a permanent free tier (500K characters/month) and supports all accents in MeteorVoice.

## Runtime Switching

The app supports runtime provider switching:

- Settings page: choose `Mock / Browser`, `Xunfei`, `Volcengine`, `Tencent Cloud`, or `Azure Neural TTS`
- Server route: `POST /api/tts`
- Provider adapters: `apps/web/lib/providers/*`
- User preference storage: `theme_preferences.tts_provider`

Provider keys stay on the server. The browser only sends the selected provider name.

Do not store provider API keys in the database for the MVP. Keep keys in server-side environment variables. Storing keys in the database would require encryption, key rotation, access auditing, and a secure admin flow.

## Environment Variables

Local Web/API development uses `apps/web/.env.local`. The deployed Tencent server uses `/etc/meteorvoice/meteorvoice.env`.

Vercel or another deployment platform should use provider-managed environment variables instead. Do not commit real keys.

After applying the first two migrations, also run:

```text
supabase/migrations/003_tts_preferences.sql
```

## Xunfei Setup

Use Xunfei first for MVP testing because it has a clear free daily quota and is reachable from China.

1. Open Xunfei Open Platform:

```text
https://www.xfyun.cn/
```

2. Create an app for online TTS.
3. Enable online speech synthesis / WebAPI.
4. Copy these values:

```text
XUNFEI_APP_ID=
XUNFEI_API_PASSWORD=
XUNFEI_API_KEY=
XUNFEI_API_SECRET=
```

5. Configure `apps/web/.env.local`, `/etc/meteorvoice/meteorvoice.env`, or deployment env vars:

```env
TTS_PROVIDER=xunfei
XUNFEI_APP_ID=your_app_id
XUNFEI_API_PASSWORD=your_api_password
XUNFEI_TTS_VOICE=your_default_fallback_v3_voice_vcn
```

`XUNFEI_API_PASSWORD` is preferred and is sent only by the server in the `x-api-key` WebSocket handshake header. The legacy `XUNFEI_API_KEY` plus `XUNFEI_API_SECRET` HMAC signature remains supported when no API password is configured. Never expose any of these values through `EXPO_PUBLIC_*` variables or mobile application code.

6. In the app Settings page, select `Xunfei`, then select the coach voice from the unified coach voice list.

Xunfei V3 voice IDs are not compatible with older 1.0/2.0 voice IDs. MeteorVoice keeps `XUNFEI_TTS_VOICE` only as the default fallback `vcn`; the primary coach voice is selected from the app voice catalog and stored as a user preference. The current online TTS WebSocket API uses the `business.vcn` field. Some Xunfei product pages call the same concept `voice_name` for other API versions; use the value currently authorized in the console for the same product/API version, not an unlicensed or legacy voice ID copied from older docs.

The adapter sends MP3 output with `aue=lame` and `sfl=1`, matching Xunfei's online TTS requirement for MP3 streaming.

Current featured voice IDs in the app catalog:

```env
x4_enus_catherine_profnews  # English female
x4_enus_ryan_assist         # English male
x4_lingxiaolu_en            # Mandarin female
x4_yezi                     # Mandarin female
```

The English voices and `x4_lingxiaolu_en` expire at `2026-06-09 00:00 Asia/Shanghai`. `x4_yezi` is a featured voice without a known expiry in the current console. MeteorVoice will stop treating expired voices as available after their configured expiry time and will fall back to another available voice/provider path. This is only an application-side guard; cancel or confirm trial renewal/billing directly in the Xunfei console before expiry.

The base voices currently visible in the console may be Mandarin-only, for example `x4_xiaoyan`, `aisjiuxu`, `aisjinger`, and `aisbabyxu`. `x4_lingxiaolu_en` and `x4_yezi` are also Mandarin female voices but are treated as featured voices in MeteorVoice. Do not use Mandarin-only voices as the English coaching default unless you intentionally want Chinese speech output; after the English featured voices expire, configure a purchased English V3 voice or use another TTS provider for English practice.

Xunfei voice profiles are seeded into `tts_voice_profiles` because the current console data has been confirmed. Settings filters the unified coach voice list by the selected provider, so selecting `Xunfei` shows only Xunfei voices. The selected coach voice is stored as `theme_preferences.selected_voice_profile_id`; the provider-specific voice id is stored as `theme_preferences.tts_voice_id`.

## Volcengine Setup

1. Open Volcengine console:

```text
https://console.volcengine.com/
```

2. Enable speech synthesis / audio technology.
3. Copy app id and access token.
4. Configure:

```env
TTS_PROVIDER=volcengine
VOLCENGINE_TTS_APP_ID=your_app_id
VOLCENGINE_TTS_ACCESS_TOKEN=your_access_token
VOLCENGINE_TTS_CLUSTER=volcano_tts
VOLCENGINE_TTS_VOICE=BV001_streaming
```

5. In the app Settings page, select `Volcengine`.

## Tencent Cloud Setup

1. Open Tencent Cloud TTS:

```text
https://cloud.tencent.com/product/tts
```

2. Enable text-to-speech.
3. Create or reuse an API key:

```text
SecretId
SecretKey
```

4. Configure:

```env
TTS_PROVIDER=tencent
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key
TENCENT_TTS_REGION=ap-guangzhou
TENCENT_TTS_VOICE=101001
```

5. In the app Settings page, select `Tencent Cloud`.

## Azure Neural TTS Setup

Azure Neural TTS supports all accents and has a permanent free tier (500K characters/month, F0 tier).

1. Sign in to Azure Portal with a Microsoft account:

```text
https://portal.azure.com
```

2. Search for `Speech` and create a resource:
   - Region: `East Asia` (Hong Kong, lowest latency for Asia)
   - Pricing tier: `Free F0`

3. Go to **Keys and Endpoint**, copy **KEY 1** and **Location** (e.g. `eastasia`).

4. Configure:

```env
TTS_PROVIDER=azure
AZURE_SPEECH_KEY=your_key_1
AZURE_SPEECH_REGION=eastasia
```

5. Add Azure voices to `tts_voice_profiles`, one row per voice.
6. In the app Settings page, select `Azure Neural TTS`; the coach voice list will show only Azure rows from `tts_voice_profiles`.

Do not hard-code Azure voice choices in Mobile. Azure voice IDs should be maintained in `tts_voice_profiles` after they are confirmed for the target Azure Speech resource.

## Provider Behavior

- `mock`: browser speech synthesis fallback
- `xunfei`: server-side WebSocket provider; requires explicit V3-compatible `XUNFEI_TTS_VOICE`
- `volcengine`: server-side HTTP provider
- `tencent`: server-side signed Tencent Cloud API request
- `azure`: server-side Azure Neural TTS REST API, supports all accents

If a selected provider is not configured, the frontend falls back to browser mock speech.

## Latency and Streaming Direction

Current production behavior is intentionally conservative:

1. Wait for the AI coach reply text.
2. Send the complete reply text to the selected TTS provider.
3. Wait for a complete playable audio result.
4. Play the reply once.

This keeps Web and iOS browser playback stable. Xunfei's WebSocket API returns audio in chunks, but MeteorVoice currently buffers those chunks into one MP3 data URL before playback. The app does not currently stream partial audio chunks into the browser player.

Do not implement Web chunk-by-chunk playback as a quick optimization. On Web, especially iOS Safari/Chrome, continuously appending MP3 chunks can introduce autoplay failures, small gaps, clipped starts, or inconsistent AudioContext behavior. A low-latency implementation needs a dedicated audio queue, cancellation rules, pause/resume handling, and browser-specific fallback paths.

Near-term latency strategy:

- Keep replies short and direct so complete-text TTS remains fast.
- Keep one complete TTS audio playback per coach reply.
- Prefer provider-side speed control when supported, and avoid browser playback-rate stacking unless it is the fallback path.

Deferred upgrade options:

1. **Complete text + streamed audio playback**: send one complete coach reply to TTS, but start playback when the first audio chunks arrive. This is not adopted today and needs a separate QA plan before any implementation.
2. **LLM streaming + TTS sentence queue**: stream the AI reply text, split into stable sentences, synthesize each segment, and play through an ordered queue. This is explicitly deferred for both Web and Mobile because sentence boundaries, cancellation, user interruption, and cross-segment naturalness are high-risk.

Decision: keep Web and Mobile on complete-reply playback for now. Record streaming/chunk/sentence playback as a future audio architecture task, not as a small Web or Mobile patch.

## Coach Voice Catalog

`tts_voice_profiles` is the source of truth for selectable coach voices. A provider can have many voice rows. Web and Mobile receive the full list from `/api/preferences` and filter it by the selected provider.

`accent_key`, `accent_label`, and `accent_region` remain metadata on each voice profile for AI context and fallback behavior. They are not a standalone user preference.

Do not expose provider voice IDs as the primary UI. The user chooses a coach voice profile, and the app maps it to the provider-specific `provider_voice_id`.

## Completion Status

- Implemented: provider switching UI, server-side `/api/tts`, Xunfei/Volcengine/Tencent/Azure provider adapters, Supabase-backed user preference, unified coach voice profiles.
- Requires user configuration: provider account creation, server environment variables, `003_tts_preferences.sql`.
- Not fully verified without credentials: real provider audio output and exact provider-specific voice IDs.

## Validation

```bash
npm run build
```

Then run the app, open Settings, select a TTS provider, and start a session.
