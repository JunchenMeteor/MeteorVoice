# TTS Integration Guide

## Current Direction

For users in China, use domestic TTS providers first:

1. Xunfei
2. Volcengine
3. Tencent Cloud

Google Cloud TTS remains a future option, but it is not the default path because account and billing setup can be blocked by region/payment constraints.

## Runtime Switching

The app supports runtime provider switching:

- Settings page: choose `Mock / Browser`, `Xunfei`, `Volcengine`, or `Tencent Cloud`
- Server route: `POST /api/tts`
- Provider adapters: `apps/web/lib/providers/*`
- User preference storage: `theme_preferences.tts_provider`

Provider keys stay on the server. The browser only sends the selected provider name.

Do not store provider API keys in the database for the MVP. Keep keys in server-side environment variables. Storing keys in the database would require encryption, key rotation, access auditing, and a secure admin flow.

## Environment Variables

Local development uses `.env.local`.

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
XUNFEI_API_KEY=
XUNFEI_API_SECRET=
```

5. Configure `.env.local` or deployment env vars:

```env
TTS_PROVIDER=xunfei
XUNFEI_APP_ID=your_app_id
XUNFEI_API_KEY=your_api_key
XUNFEI_API_SECRET=your_api_secret
XUNFEI_TTS_VOICE=your_v3_voice_vcn_from_xunfei_console
# Optional accent-specific overrides. These must also be V3-compatible vcn values.
XUNFEI_TTS_VOICE_AMERICAN=your_american_v3_voice_vcn
XUNFEI_TTS_VOICE_BRITISH=
XUNFEI_TTS_VOICE_INDIAN=
```

6. In the app Settings page, select `Xunfei`.

Xunfei V3 voice IDs are not compatible with older 1.0/2.0 voice IDs. MeteorVoice does not provide a hard-coded Xunfei voice fallback; configure `XUNFEI_TTS_VOICE` or an accent-specific override with the exact `vcn` authorized in the Xunfei console. The current online TTS WebSocket API uses the `business.vcn` field. Some Xunfei product pages call the same concept `voice_name` for other API versions; use the value currently authorized in the console for the same product/API version, not an unlicensed or legacy voice ID copied from older docs.

The adapter sends MP3 output with `aue=lame` and `sfl=1`, matching Xunfei's online TTS requirement for MP3 streaming.

Current trial voice IDs, if still active in the Xunfei console:

```env
# English male trial voice.
XUNFEI_TTS_VOICE=x4_enus_catherine_profnews
# English female trial voice.
XUNFEI_TTS_VOICE_AMERICAN=x4_enus_ryan_assist
```

These two trial voices expire at `2026-06-09 00:00 Asia/Shanghai`. MeteorVoice will stop treating them as available after that time and will fall back to another available TTS provider or mock playback. This is only an application-side guard; cancel or confirm trial renewal/billing directly in the Xunfei console before expiry.

The base voices currently visible in the console may be Mandarin-only, for example `x4_xiaoyan`, `x4_yezi`, `aisjiuxu`, `aisjinger`, and `aisbabyxu`. `x4_lingxiaolu_en` is also Mandarin female but is treated as a trial/featured voice in MeteorVoice. Do not use Mandarin-only voices as the English coaching default unless you intentionally want Chinese speech output; after the English trial voices expire, configure a purchased English V3 voice or use another TTS provider for English practice.

Settings shows the server-side Xunfei voice configuration when Xunfei is selected: configured env key, voice ID, language, gender, base/trial tier, active/expired status, and trial expiry when known. This is read-only because voice availability is controlled by server environment variables and Xunfei console authorization.

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

## Provider Behavior

- `mock`: browser speech synthesis fallback
- `xunfei`: server-side WebSocket provider; requires explicit V3-compatible `XUNFEI_TTS_VOICE`
- `volcengine`: server-side HTTP provider
- `tencent`: server-side signed Tencent Cloud API request

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

1. **Complete text + streamed audio playback**: send one complete coach reply to TTS, but start playback when the first audio chunks arrive. This may be worth exploring on native mobile first, where AVQueuePlayer/ExoPlayer-style queues are more reliable than Web audio chunk appending.
2. **LLM streaming + TTS sentence queue**: stream the AI reply text, split into stable sentences, synthesize each segment, and play through an ordered queue. This is higher risk because sentence boundaries, cancellation, user interruption, and cross-segment naturalness must be handled carefully.

Decision: keep Web on complete-reply playback for now. Record streaming playback as a future native-first audio architecture task, not as a small Web patch.

## Accent Capability Status

The Settings page disables accent options that are not supported by the selected TTS provider.

Current conservative mapping:

| Provider | Enabled accents |
|---|---|
| Mock / Browser | British, American, Indian, Australian, Singapore, African |
| Xunfei | American only |
| Volcengine | American only |
| Tencent Cloud | American only |

## Future Accent Direction

Provider voice IDs SHOULD be hidden behind product-level voice profiles. The long-term voice profile model is tracked in `docs/architecture-productization-roadmap.md`.

Do not expose provider voice IDs directly in UI. A user should choose a meaningful profile such as American coach, British interview, or Australian casual, while the app maps that choice to provider-specific capabilities.

Open additional accents only after the exact provider voice IDs are confirmed and tested.

## Completion Status

- Implemented: provider switching UI, server-side `/api/tts`, Xunfei/Volcengine/Tencent provider adapters, Supabase-backed user preference, accent capability gating.
- Requires user configuration: provider account creation, server environment variables, `003_tts_preferences.sql`.
- Not fully verified without credentials: real provider audio output and exact provider-specific voice IDs.

## Validation

```bash
npm run build
```

Then run the app, open Settings, select a TTS provider, and start a session.
