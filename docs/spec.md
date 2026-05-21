# English Conversation Coach Spec

Status: Product reference. This remains useful for business scope and data model intent, but current implementation plans are tracked in the active docs listed by `docs/index.md`.

## Product Goal

Build a one-to-one English conversation coach that uses voice input and voice output, keeps the conversation natural and playful, supports real-world scenarios, adapts to global accents, and helps the user learn through live correction and post-turn feedback.

## Target Users and Roles

- Primary user: a learner who wants to improve spoken English through conversation
- Secondary user: the same learner on another device, using synced history and preferences
- System role: an AI coach that speaks, listens, corrects, and adapts accent/style by scenario

## Core Loop

```text
user enters a scenario -> app listens during the active session -> speech is transcribed -> AI replies in voice with an auto-selected accent -> AI may interrupt for a correction -> the turn ends -> the app shows a correction summary -> the user continues or exits
```

## MVP Scope

- One-to-one voice conversation
- Scenario-based conversation starters
- Automatic accent selection
- Live interruption for major corrections
- End-of-turn correction summary
- Clickable correction items with replayable audio
- Session start and session end controls
- Login and persistent user history
- English-first conversation UI
- Chinese and English UI support outside the conversation area
- Theme switching across the whole system
- Optional retrieval-enhanced support for scenario packs, user history, and correction memory

## Non-Goals

- No group chat
- No social feed
- No full course curriculum
- No heavy textbook-style grammar lessons
- No multi-language learning beyond English
- No background listening outside an active session

## Data Model

At minimum, implement:

- `User`
- `Session`
- `Turn`
- `CorrectionItem`
- `AccentProfile`
- `Scenario`
- `ThemePreference`
- `AudioClip`
- `LearningHistory`

Suggested fields:

- `User`: id, email, displayName, locale, createdAt
- `Session`: id, userId, scenarioId, accentProfileId, startedAt, endedAt, status
- `Turn`: id, sessionId, speaker, transcript, translatedText, audioUrl, createdAt
- `CorrectionItem`: id, turnId, type, originalText, suggestedText, explanation, audioUrl, severity
- `AccentProfile`: id, name, region, description, enabled
- `Scenario`: id, key, name, description, difficulty
- `ThemePreference`: userId, themeKey, uiMode, subtitleMode
- `ThemePreference.ttsProvider`: selected TTS provider, such as mock, xunfei, volcengine, or tencent
- `AudioClip`: id, ownerType, ownerId, url, duration
- `LearningHistory`: id, userId, sessionId, summary, createdAt

## Pages / APIs / Workers / Integrations

### Pages

- Login / signup
- Home / scenario selection
- Conversation session
- Session review
- Correction history
- Settings
- Theme selector

### APIs

- Auth endpoints
- Session start / stop
- Turn submission
- Speech transcription
- AI reply generation
- Correction summary retrieval
- Theme and preference persistence
- Optional retrieval search over scenario packs and correction history

### Workers / Services

- Speech-to-text worker
- Text-to-speech worker
- Accent selection service
- Correction analysis service
- Session summary service
- Optional retrieval indexing and query service for scenario packs, correction history, and reusable phrases

### Integrations

- Login provider
- Speech recognition provider
- Text-to-speech provider
- TTS provider capability map for accent availability
- AI model provider
- Storage for audio and history

## Architecture and Tech Stack

This is an MVP, so technology choices should optimize for low cost, fast validation, cloud access, sync, and easy replacement. The stack below is a recommendation, not a hard requirement.

Recommended default stack, not a hard requirement:

- Framework: Next.js + TypeScript, or another full-stack TypeScript framework if it is cheaper or already preferred
- Hosting: Vercel or a similar host so the app is reachable from desktop and mobile
- Database: Supabase Postgres or another managed cloud database for synced history, preferences, and multi-device access; use SQLite only for local development if needed
- UI: shadcn/ui components with Tailwind CSS and a theme-token system; use a lighter component setup if it lowers setup cost
- Charts: Recharts only if the review/history data justifies it; omit charts in the first demo if they slow the MVP
- AI streaming: Vercel AI SDK is a strong default for TypeScript model streaming and provider abstraction
- Current default conversation model: DeepSeek, but keep the slot replaceable
- AI workflow: use LangGraph directly as an in-app library for the conversation workflow layer; do not deploy a separate LangGraph server for the MVP
- AI utilities: LangChain only where it adds value, such as prompt templates, provider adapters, structured output parsing, or future tool integration
- Retrieval layer: optional RAG-style retrieval for scenario packs, user history, and correction memory; add it after the core voice loop is stable
- Auth: local email/password or lightweight credentials-based auth for the MVP
- Speech: browser microphone capture with STT/TTS provider abstractions and mock providers for development
- Domestic TTS options: Xunfei first, then Volcengine and Tencent Cloud; keep Google as a future option
- Storage: cloud storage/persistence for synced history, corrections, preferences, and audio metadata; local mock data is acceptable for development

Recommended approach:

- Keep the first version boring and proven
- Use a theme-token system instead of hard-coded colors
- Make UI text and theme state persist per user
- Prefer Vercel AI SDK as the primary AI request layer when building with TypeScript
- Use LangGraph for multi-step learning flows from the start, but keep it isolated in a `conversationWorkflow` layer
- Do not introduce LangChain broadly unless it removes real complexity
- Keep all external AI and speech provider keys in `.env.local`
- Keep paid provider usage optional in the MVP through mock providers and adapter interfaces
- Make device switching and mobile access first-class requirements, not future enhancements
- If a different stack is already preferred for implementation, keep these same product and cost constraints while swapping the concrete tools.

## AI Application Pattern

Use a layered AI application design:

1. **Provider layer**: wraps model, STT, and TTS providers behind local interfaces.
2. **Conversation workflow**: LangGraph manages turn state, active session state, interruption decisions, correction generation, and summary generation inside the app backend.
3. **Streaming layer**: Vercel AI SDK or provider SDK streams model responses to the UI.
4. **Persistence layer**: cloud persistence stores sessions, turns, correction items, user preferences, and review data so history syncs across devices.
5. **Mock layer**: local mock providers keep the app runnable without paid AI or speech credentials.

Do not build a general-purpose agent platform in v1. The AI should be scoped to conversation coaching, accent selection, correction, and session review.

## AI Development Mode Selection

Use the common AI application development modes deliberately:

- **HTTP API direct calls**: keep as the lowest-level fallback inside provider adapters only. Do not scatter raw HTTP calls across UI or business logic.
- **Official/provider SDKs**: use where a speech or model provider has a stable TypeScript SDK and it reduces request/streaming/error handling work.
- **AI development frameworks**: in a TypeScript MVP, prefer Vercel AI SDK for model streaming, use LangGraph directly for stateful conversation/correction workflows, and use LangChain only for focused utilities such as prompt templates, structured output parsing, or future tool integration.
- **Low-code AI platforms**: do not use for the production app in v1. They can be used separately for prototype validation, prompt experiments, or internal workflow exploration.
- **AI coding tool SDKs**: do not include in the user-facing app runtime. They can be used outside the app to automate code generation, review, test fixing, or future developer workflows.

## Security and Privacy Boundaries

- Microphone only active during a live session
- Stop microphone capture immediately when the session ends
- Do not re-request permission if the user already granted it
- Persist user history only after login
- Make audio/transcript deletion possible
- Show when recording/listening is active
- Avoid silent background listening

## Development Phases

### Phase 1

- Login
- Scenario selection
- Voice conversation loop
- Session start/end
- Basic theme switching

### Phase 2

- Automatic accent rotation
- Live interruption correction
- End-of-turn correction list
- Replayable correction audio

### Phase 3

- Bilingual UI support
- Learning history
- Session summaries
- Personal preferences

### Phase 4

- More theme modes
- Accent expansion
- Review and retention features

## Current Completion Snapshot

- Core voice loop: implemented with mock and provider-based TTS.
- Auth and persistence: implemented with Supabase and RLS.
- TTS provider switching: implemented with user preference storage.
- Accent gating: implemented for unsupported provider accents.
- Docs: partially synchronized; the new project structure doc clarifies the frontend/backend-like layering.

## Validation and Acceptance Criteria

Validation should confirm:

- the app builds successfully
- voice session start/end works
- mic capture stops at session end
- correction list renders correctly
- theme switching applies globally
- bilingual UI strings appear correctly
- login persistence works

Example commands:

```bash
npm run build
npm test
npm run dev
```

## Risks and Open Questions

- Real-time speech quality may vary by provider
- Accent generation and recognition quality may limit realism
- Live interruption may feel intrusive if overused
- Bilingual subtitles may distract if shown too aggressively
- Theme consistency must be handled through tokens, not hard-coded colors
- Retrieval quality will depend on how scenario packs and correction history are structured and indexed
- Real voice quality and accent support must be verified against each provider's actual voice IDs
