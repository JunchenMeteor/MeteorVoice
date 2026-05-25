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

Xunfei V3 voice IDs are not compatible with older 1.0/2.0 voice IDs. MeteorVoice does not provide a hard-coded Xunfei voice fallback; configure `XUNFEI_TTS_VOICE` or an accent-specific override with the exact `vcn` authorized in the Xunfei console. The current WebSocket API uses the `business.vcn` field. If a Xunfei product page uses `voice_name` for another API version, use the corresponding value from the same V3 voice catalog rather than the old `x4_*` defaults.

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
