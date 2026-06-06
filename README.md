# MeteorVoice

<p align="center">
  <strong>A voice-first English conversation coach with live correction, accent adaptation, and cross-device sync</strong>
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs" />
  <img alt="Expo" src="https://img.shields.io/badge/Expo-55-000020?style=for-the-badge&logo=expo&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  <img alt="AI" src="https://img.shields.io/badge/AI-DeepSeek-4B7BFF?style=for-the-badge" />
  <br />
  <a href="https://github.com/JunchenMeteor/MeteorVoice/issues"><img alt="Issues" src="https://img.shields.io/badge/Links-Issues-1F6FEB" /></a>
  <br />
  <a href="README.md"><img alt="Docs English" src="https://img.shields.io/badge/Docs-English-black" /></a>
  <a href="README.zh-CN.md"><img alt="Docs 中文" src="https://img.shields.io/badge/Docs-%E4%B8%AD%E6%96%87-red" /></a>
</p>

MeteorVoice is a voice-first English conversation coach. The user picks a scenario, speaks naturally, receives live corrections, and hears the AI coach reply with an adapted accent. Sessions are synced across devices through Supabase.

## Table of Contents

- [Maintainer](#maintainer)
- [Background](#background)
- [Core Capabilities](#core-capabilities)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Run](#run)
- [Mobile](#mobile)
- [TTS Providers](#tts-providers)
- [Validation](#validation)
- [Roadmap](#roadmap)

## Maintainer

MeteorVoice is initiated and maintained by **Meteor**.

The project focuses on spoken English practice through natural AI conversation, real-time correction feedback, and voice quality that feels close to a real coach. The goal is not a grammar drill tool, but a product where users actually want to keep talking.

## Background

Most English learning apps fall into one of two traps:

- They are reading or writing tools dressed up as speaking practice.
- They use voice input but reply with robotic TTS that breaks immersion immediately.

MeteorVoice is built around the opposite assumption: voice quality and conversation naturalness come first. Corrections are non-blocking and appear alongside the conversation, not as interruptions. The AI coach follows what the user says instead of redirecting to scripted prompts.

```mermaid
sequenceDiagram
    participant User
    participant App as MeteorVoice
    participant AI as AI Coach

    User->>App: Start session, pick scenario
    App->>User: Coach opens the conversation
    User->>App: Speak
    App->>AI: Transcribe + generate reply
    AI->>App: Reply text + corrections
    App->>User: Play reply with accent TTS
    App->>User: Show corrections non-blocking
    User->>App: Continue or end session
    App->>App: Sync session history to Supabase
```

## Core Capabilities

- One-to-one voice conversation with an AI coach
- Scenario-based conversation starters (interview, travel, restaurant, workplace, small talk)
- Live correction with grammar, vocabulary, fluency, and pronunciation feedback
- Accent adaptation across sessions (American, British, Indian, Australian, and more)
- Non-blocking correction panel — corrections appear without interrupting the conversation
- Bilingual UI (English and Chinese) outside the conversation area
- Response language routing — AI replies and correction explanations follow the selected UI language
- Theme switching with CSS custom properties
- Login, session history, and preference sync through Supabase
- Shared ASR provider layer with Xunfei bootstrap, native iOS PCM capture, and provider diagnostics
- Unified runtime feedback for loading, blocking operations, network errors, and 401 sign-out
- Authenticated API guard for high-cost AI, TTS, ASR, and session routes
- Mock AI/STT/TTS providers for local development without API keys
- Native mobile client (iOS/Android) via Expo React Native

## System Architecture

```mermaid
flowchart TB
    Web[MeteorVoice Web<br/>Next.js]
    Mobile[MeteorVoice Mobile<br/>Expo React Native]

    subgraph Platform[Backend]
        API[Next.js API Routes<br/>TTS / ASR / Chat / Session / Turns]
        Supabase[Supabase<br/>Auth / DB / Preferences]
        AI[AI Provider<br/>DeepSeek via Vercel AI SDK]
        TTS[TTS Providers<br/>Xunfei / Volcengine / Tencent / Azure]
        ASR[ASR Providers<br/>Native / Xunfei / Azure-ready]
    end

    subgraph Shared[packages/]
        SharedPkg[shared<br/>types / i18n / provider interfaces]
        SessionCore[session-core<br/>turn lifecycle / workflow]
        APIClient[api-client<br/>typed API calls]
        Runtime[shared runtime<br/>feedback / operation groups]
    end

    Web --> API
    Mobile --> APIClient
    APIClient --> API
    API --> Supabase
    API --> AI
    API --> TTS
    API --> ASR
    Web --> Shared
    Mobile --> Shared
    Web --> Runtime
    Mobile --> Runtime
```

Responsibility boundaries:

- `apps/web`: Next.js full-stack app — UI, API routes, server-side TTS/AI orchestration.
- `apps/mobile`: Expo React Native native client — voice session UI, native audio, native PCM capture, background keep-alive.
- `packages/shared`: cross-client types, i18n strings, provider interfaces, ASR/TTS capabilities, app feedback state, and grouped async operation helpers.
- `packages/session-core`: platform-neutral turn lifecycle and workflow state machine.
- `packages/api-client`: typed API calls shared by Web and Mobile, including request timeout and formatted error handling.

Settings synchronization now separates full refresh and targeted updates:

- Page entry, login, foreground resume, and manual refresh use grouped operations so multiple API requests share one loading state.
- A single setting save uses the returned `/api/preferences` payload and applies only the affected settings domain.
- AI response language is passed as `responseLocale`; ASR recognition language is configured separately.

## Project Structure

```text
MeteorVoice/
├── apps/
│   ├── web/                  Next.js web app
│   │   ├── app/              pages and API routes
│   │   ├── components/       reusable UI components
│   │   └── lib/
│   │       ├── providers/    TTS / STT / AI adapters
│   │       └── server/       server-only business logic
│   └── mobile/               Expo React Native app
├── packages/
│   ├── shared/               types, i18n, provider interfaces
│   ├── session-core/         turn lifecycle and workflow
│   └── api-client/           typed API client
├── supabase/migrations/      ordered SQL migration files
└── docs/                     product and architecture docs
```

See `docs/project-structure.md` for layering rules and architecture decisions.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com), then run these migrations in order in the SQL Editor:

```text
supabase/migrations/001_init.sql
supabase/migrations/002_rls.sql
supabase/migrations/003_tts_preferences.sql
```

### 3. Configure environment variables

```bash
cd apps/web
cp .env.local.example .env.local
```

Fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEEPSEEK_API_KEY=your-deepseek-api-key        # optional — mock AI works without it
```

ASR/TTS provider keys (all optional — mock/native fallback works without them):

```text
ASR_PROVIDER=native
TTS_PROVIDER=mock
XUNFEI_APP_ID=
XUNFEI_API_KEY=
XUNFEI_API_SECRET=
XUNFEI_ASR_PRODUCT=zh_iat
XUNFEI_TTS_VOICE=                 # default fallback vcn; coach voice is selectable in Settings
VOLCENGINE_ACCESS_KEY=
VOLCENGINE_SECRET_KEY=
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastasia
```

### 4. Configure Supabase Authentication

In the Supabase console under Authentication → URL Configuration:

- Site URL: `http://127.0.0.1:3001`
- Redirect URLs: `http://127.0.0.1:3001/**`

## Run

```bash
cd apps/web
npm run dev
```

Open `http://127.0.0.1:3001`

The app runs fully in mock mode without any API keys. Real AI replies require `DEEPSEEK_API_KEY`. Real voice output requires at least one TTS provider key. Remote ASR requires provider credentials and `ASR_PROVIDER`; otherwise mobile can use native speech recognition.

## Mobile

The mobile client is built with Expo React Native and targets iOS and Android.

### Local build (Mac + Xcode required)

```bash
cd apps/mobile
npx expo run:ios
```

### EAS cloud build

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build --platform ios --profile preview
```

The `preview` profile generates a `.ipa` installable via Xcode → Devices without App Store submission.

Background audio keep-alive is enabled in `app.json` (`UIBackgroundModes: audio`). This requires an EAS build or local Xcode build — it cannot be tested in Expo Go.

Set the API base URL in `apps/mobile/app.json`:

```json
"extra": {
  "apiBaseUrl": "https://meteorvoice.jcmeteor.com",
  "apiBaseUrlPreview": "https://mv-pre.jcmeteor.com"
}
```

## Release Management

Production releases are managed by the GitHub Actions `Release Manager` workflow:

```text
GitHub -> Actions -> Release Manager -> Run workflow
```

Use `action=full` with a semantic version such as `1.3.1`. The workflow creates the release issue and PRs, waits for checks, promotes `main` to `release`, waits for Tencent deployment, verifies public URLs, and creates the GitHub Release.

Detailed operation and recovery steps live in `docs/release-manager.md`.

## TTS Providers

Domestic providers are the recommended real voice path:

| Provider | Key | Notes |
|----------|-----|-------|
| Xunfei | `xunfei` | Recommended first choice |
| Volcengine | `volcengine` | Bytedance TTS |
| Tencent Cloud | `tencent` | Alternative |
| Mock / Browser | `mock` | Default, no key needed |
| Azure Neural TTS | `azure` | Full accent support, permanent free tier |

Each user's selected provider is stored in Supabase. Provider credentials stay in server-side environment variables only.

See `docs/tts-integration.md` for provider setup details.

## ASR Providers

MeteorVoice now exposes a shared ASR provider layer:

| Provider | Key | Status |
|----------|-----|--------|
| Native mobile speech | `native` | Default fallback |
| Xunfei `zh_iat` | `xunfei` | Signed WebSocket bootstrap and iOS PCM streaming path |
| Azure Speech | `azure` | Contract-ready, pending runtime adapter |

The ASR layer is split from AI response language routing: `ASR languageMode` controls recognition, while `responseLocale` controls how the coach replies.

See `docs/asr-provider-layer.md` for contracts, rollout steps, diagnostics, and test guidance.

## Validation

```bash
npx vitest run   # unit tests
npm run build    # production build check
```

## Roadmap

```mermaid
flowchart LR
    MVP[MVP<br/>Voice loop / corrections / TTS / Web + Mobile]
    Polish[Polish<br/>Voice quality / conversation naturalness / session UX]
    Distribution[Distribution<br/>TestFlight internal / EAS production build]
    Growth[Growth<br/>More scenarios / retention features / social]

    MVP --> Polish --> Distribution --> Growth
```

### Technical Evolution

| Phase | Description | Status |
|-------|-------------|--------|
| **MVP** | Voice loop, corrections, TTS, Web app functional | ✅ Delivered |
| **Dual-platform architecture** | `apps/web` + `apps/mobile` + `packages/*` monorepo | ✅ Delivered |
| **Immersive UI** | Voice waveform, desktop/mobile layouts, real-time subtitles | ✅ Delivered |
| **Productization** | History with expansion/pagination, cross-device preferences sync, CI parallel jobs, mobile audio hardening | ✅ Delivered |
| **Semantic endpointing** | L1 local rules + L2 LLM-based end-of-turn detection + L3 safety net, replacing fixed silence timeout | ✅ Delivered |
| **ASR provider layer** | Shared ASR contracts, Xunfei bootstrap, native PCM diagnostics, mobile session integration | ✅ Delivered |
| **Accent capabilities** | TTS provider voice catalog, multi-accent speakers (US/UK/Indian/Australian) | 🚧 In implementation |
| **Distribution** | TestFlight beta, EAS production build | 📋 Planned |
