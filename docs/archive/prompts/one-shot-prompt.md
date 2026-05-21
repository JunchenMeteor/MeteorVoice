# English Conversation Coach One-Shot Development Prompt

```md
## Role

You are a senior full-stack engineer specialized in modern web apps, voice interaction, AI product workflows, authentication, and polished responsive UI.

## Project Name

Build an app called English Conversation Coach.

## Project Goal

Build a one-to-one English conversation coach that lets users practice spoken English through voice input and voice output, with scenario-based conversation, automatic global accent selection, live correction, post-turn correction summaries, bilingual UI support, login persistence, and system-wide theme modes.
Use DeepSeek as the current default conversation model, but keep the model boundary replaceable for future migration.

## Core Workflow

user logs in -> user selects or starts a scenario -> app starts an active voice session -> microphone listens only during the active session -> speech is transcribed -> AI replies with voice using an auto-selected accent profile -> AI may interrupt for major corrections -> the turn ends -> the app shows correction items -> user can replay corrected audio, continue the session, or end the session -> microphone stops immediately when the session ends

## Core Features

1. Authentication and user preferences
   - Implement login/signup.
   - Persist user preferences after login.
   - Store locale, theme, subtitle mode, and recent scenario.

2. Scenario-based voice conversation
   - Provide initial scenarios such as interview, travel, daily small talk, restaurant, and workplace conversation.
   - Each session should have an active state and an ended state.
   - The microphone must only be active during an active session.
   - Ending a session must stop microphone capture immediately.
   - Do not repeatedly request microphone permission after the user has already granted it.

3. Voice input and output
   - Implement a voice session UI with clear listening, speaking, and stopped states.
   - Use browser speech APIs or provider abstraction for speech-to-text and text-to-speech.
   - If real provider keys are unavailable, include a local mock mode so the app remains runnable.

4. Accent profiles
   - Automatically select an accent profile for each session or day.
   - Include starter profiles such as British English, General American, Indian English, Australian English, Singapore English, and African English.
   - Show the current accent profile in the session UI.

5. Correction experience
   - Support live interruption only for important mistakes.
   - At the end of each turn, show a correction list.
   - Correction items should include type, original phrase, suggested phrase, short explanation, and replay action.
   - Include grammar, vocabulary, fluency, and pronunciation categories.

6. Conversation subtitles
   - Conversation UI should be English-first.
   - Support subtitle modes: English only, bilingual, and Chinese helper.
   - Avoid forcing bilingual subtitles by default because they can distract from speaking practice.

7. Bilingual app UI
   - Support English and Chinese for non-conversation UI.
   - Include locale switching in settings.
   - Persist the locale preference.

8. Theme modes
   - Implement a system-wide theme token approach inspired by MeteorTest.
   - Do not hard-code page colors directly inside components.
   - Provide several themes, such as Default Calm, Learning, Conversation, Night, Bright, and Playful.
   - Theme changes must affect the whole app: background, panels, subtitles, correction list, buttons, voice controls, scenario chips, and accent badges.

9. History and review
   - Save sessions, turns, correction items, and summaries for logged-in users.
   - Provide a session review page and correction history page.
   - Optionally support retrieval-enhanced scenario packs and correction memory for later phases.

## Data Model

At minimum, implement these entities:

- User
- Session
- Turn
- CorrectionItem
- AccentProfile
- Scenario
- ThemePreference
- AudioClip
- LearningHistory

Include fields, relationships, status enums, and deletion rules.

## Tech Stack

Use a boring, proven, low-cost cloud-accessible MVP stack with a deliberate AI architecture. Do not treat the app as just a direct model API call. The stack below is recommended, not mandatory; choose cheaper or simpler alternatives if they preserve the product loop, mobile access, and cross-device sync.

Recommended default:

- Framework: Next.js + TypeScript, or another full-stack TypeScript framework if it is cheaper/easier in the target environment
- Hosting: Vercel or similar so the app is reachable from desktop and mobile
- Language: TypeScript
- UI: shadcn/ui, Tailwind CSS, and CSS variables/design tokens; use a lighter component setup if it reduces MVP cost
- Auth: simple email/password or provider-based auth
- Database: Supabase Postgres or another managed cloud database for synced history, preferences, and mobile access; use SQLite only for local development if needed
- Charts: Recharts for learning progress, correction categories, and session history, but only after the review/history data exists
- Speech: browser SpeechRecognition/SpeechSynthesis or provider abstraction, with mock providers required for local demo
- AI streaming: Vercel AI SDK is the recommended model streaming and provider abstraction layer for TypeScript
- Current default conversation model: DeepSeek
- AI workflow: use LangGraph directly as an in-app library for the conversation workflow layer; do not deploy a separate LangGraph server for the MVP
- AI utilities: LangChain only where it adds clear value, such as prompt templates, provider adapters, structured output parsing, or future tool integration
- Retrieval layer: optional RAG-style retrieval over scenario packs, user history, and correction memory; keep it out of the first voice-loop milestone unless it clearly helps the MVP
- AI provider mode: keep raw HTTP API calls inside provider adapters only; prefer official SDKs or Vercel AI SDK where practical
- Testing: unit tests for services and basic UI tests for session state

Cost-control requirements:

- The deployed MVP must work on desktop and mobile.
- Include mock AI/STT/TTS providers from the start.
- Keep provider keys optional in `.env.local`.
- Defer paid provider integration until the voice loop and correction UX are validated.
- Use managed cloud services where sync, login, or mobile access require them.

AI development mode guidance:

- Use HTTP API direct calls only as a low-level fallback.
- Use official SDKs when they reduce provider-specific request, streaming, retry, or typing work.
- Use AI frameworks for the real application flow: Vercel AI SDK for streaming, LangGraph for stateful orchestration, and LangChain selectively.
- Keep LangGraph isolated behind a `conversationWorkflow` service boundary so UI, auth, storage, and audio code do not depend directly on graph internals.
- Do not include low-code platforms such as Dify/Coze/n8n in the v1 runtime; they may be used externally for prototype or prompt validation.
- Do not include AI coding tool SDKs in the user-facing app runtime; they may be used outside the app for development automation.

## Security Boundaries

- Microphone must only run during an active session.
- Stop microphone capture immediately when the user ends a session.
- Never listen silently in the background.
- Show clear recording/listening indicators.
- Do not re-request microphone permission if permission was already granted.
- Persist user history only for logged-in users.
- Allow audio/transcript deletion.
- Keep provider API keys server-side only.

## UI Requirements

- Build the actual app experience as the first screen after login; do not create a marketing landing page.
- The product should feel conversational, warm, focused, and playful without becoming cartoonish.
- Keep the main conversation UI uncluttered.
- Use English-first conversation content.
- Use Chinese/English UI support for app navigation, settings, history, and correction explanations.
- Use theme tokens for all colors and important surfaces.
- Provide responsive layouts for desktop and mobile.
- Avoid text overlap in subtitles, correction cards, buttons, and theme controls.

## Non-Goals

- Do not build group chat.
- Do not build a social feed.
- Do not build a full course curriculum.
- Do not build a marketplace.
- Do not listen outside active sessions.
- Do not require paid AI/speech keys to run the local demo.

## Delivery Requirements

1. Generate complete runnable code.
2. Include setup documentation.
3. Include environment variable examples.
4. Include database schema or local storage model.
5. Include mock providers so the app can run without real AI/speech credentials.
6. Include validation commands.
7. Include focused tests for session lifecycle, microphone state, preferences, and correction generation.
8. Include `.env.local.example` for AI model, STT, and TTS provider keys.
9. Before implementation, verify current official documentation for whichever stack is selected. If using the recommended stack, verify Next.js, Supabase Auth/Postgres/Storage, Vercel AI SDK, LangGraph TypeScript/JavaScript, shadcn/ui, and selected STT/TTS provider APIs. If Firecrawl, Context7, or similar documentation tools are available, use them and summarize what was verified.
10. Treat retrieval/RAG as an optional enhancement layer for scenario packs and correction memory, not as a required dependency for the first runnable voice loop.

## Validation Requirements

Run:

```bash
npm run build
npm test
```

If validation cannot run, explain why and list missing prerequisites.

## Development Order

1. Choose the lowest-cost cloud-accessible MVP stack and scaffold the app/shared layout.
2. Implement auth and user preferences.
3. Implement scenarios, accent profiles, and theme tokens.
4. Implement cloud persistence and sync.
5. Implement AI provider abstraction with mock fallback.
6. Implement LangGraph conversation workflow service.
7. Implement active voice session lifecycle with mock STT/TTS providers.
8. Implement turn handling and correction summaries.
9. Implement session review, correction history, and optional summaries/charts.
10. Add bilingual UI strings and settings.
11. Add tests and validation documentation.

## Output Format

First provide a short implementation plan, then create or edit the files. Do not stop at a proposal.
```
