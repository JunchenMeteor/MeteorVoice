# English Conversation Coach Plan

## Summary

Build the first runnable version as a cloud-accessible MVP with auth, scenario selection, active voice session lifecycle, mockable speech/AI providers, a replaceable AI streaming layer, a LangGraph-backed conversation workflow, theme tokens, and synced user preferences. DeepSeek is the current default conversation model, but the model slot must stay replaceable.

## Scope

- In: Phase 1 implementation plus enough mock provider behavior to demonstrate the voice loop and correction UI in a cloud-accessible app.
- Out: full curriculum, social features, background listening, and separate LangGraph server deployment.

## Implementation Phases

1. Choose the lowest-cost cloud-accessible web baseline. Recommended default: Next.js + TypeScript.
2. Choose hosted auth/database/storage. Recommended default: Supabase.
3. Scaffold the app, layout, theme tokens, basic component system, and routing. Recommended default: shadcn/ui + Tailwind CSS.
4. Add synced persistence for users, sessions, turns, corrections, scenarios, accents, preferences, and audio metadata.
5. Implement auth and user preference persistence.
6. Seed scenarios and accent profiles.
7. Add an AI provider abstraction with mock provider fallback. Recommended default: Vercel AI SDK.
8. Use DeepSeek as the current default model for the 1-on-1 conversation flow, while keeping the provider/model boundary replaceable.
9. Add LangGraph directly as an in-app conversation workflow layer for listening, transcribing, thinking, speaking, correcting, summarizing, and ended.
10. Implement active voice session lifecycle and microphone state management.
11. Implement mock STT/TTS/AI services for local and cloud demo parity.
12. Implement turn handling and correction item generation.
13. Add session review, correction history, and optional learning/correction charts.
14. Add optional retrieval support for scenario packs, correction history, and reusable phrase memory.
15. Add validation tests for session lifecycle, mic state, preferences, workflow transitions, and correction output.

## AI Development Mode Mapping

- HTTP API direct calls: allowed only inside provider adapters as a fallback for providers without a useful SDK.
- Official SDKs: preferred for STT/TTS or model providers when they simplify streaming, retries, or typed responses.
- Vercel AI SDK: recommended streaming and model abstraction layer for a TypeScript app.
- LangGraph: use directly inside the app for stateful voice coaching flow; isolate it behind a `conversationWorkflow` service boundary.
- LangChain: optional utility layer for prompt templates, structured outputs, provider adapters, or later tool/RAG work; do not make it the center of v1.
- Retrieval / RAG: treat as a Phase 4 enhancement; use it first for scenario packs and correction memory, not for the main chat loop.
- Low-code platforms such as Dify/Coze/n8n: out of runtime scope for v1; acceptable only for external prototype or prompt validation.
- AI coding tool SDKs such as Cursor/Claude/Copilot SDKs: out of app runtime scope; can be used later for developer automation, code review, or implementation workflows.

## Task Breakdown

- Task 1: Choose and scaffold the lowest-cost cloud-accessible web baseline. Recommended default: Next.js + TypeScript.
- Task 2: Choose hosted auth/database/storage. Recommended default: Supabase.
- Task 3: Add app shell, navigation, responsive layout, and theme-token baseline. Recommended default: shadcn/ui + Tailwind.
- Task 4: Add synced persistence schema and helpers.
- Task 5: Add auth model and preference persistence.
- Task 6: Add settings for locale, theme, and subtitle mode.
- Task 7: Add scenario and accent profile seed data.
- Task 8: Add LangGraph conversation workflow service.
- Task 9: Add AI route/provider abstraction with mock fallback. Recommended default: Vercel AI SDK.
- Task 10: Add mock speech and AI provider abstractions.
- Task 11: Add correction summary cards and replay actions.
- Task 12: Add review/history pages and optional charts.
- Task 13: Add optional retrieval support for scenario packs and correction memory.
- Task 14: Add tests and README setup instructions.

## Pre-Dev Requirements

These are project-wide instructions to follow before coding starts. They are not the tech stack itself.

Before implementation, keep the prep loop focused on these three checks:

1. Use `frontend-design` to polish the page and keep the UI aligned with the intended style.
2. Use Firecrawl to verify the latest API formats and provider surface area for the chosen AI stack.
3. Use Context7 to verify the latest framework documentation for the chosen web stack.

After implementation starts, run `webapp-testing` checks at each step to validate the runnable app and visible behavior.

## Technical Stack

MVP selection rule: prefer the cheapest option that can prove the product loop, keep every expensive provider behind an adapter, and make the first real MVP usable from both desktop and mobile.

Recommended default stack:

- Framework: Next.js + TypeScript
- Hosting: Vercel or similar web hosting
- Auth/database/storage: Supabase or another managed cloud backend
- UI: shadcn/ui + Tailwind CSS + CSS theme tokens
- Charts: Recharts only after review/history has enough data to visualize
- AI SDK: Vercel AI SDK for streaming chat and provider abstraction
- Current default model: DeepSeek
- AI workflow: LangGraph as an in-app library for the conversation workflow layer; do not deploy a separate LangGraph server in the MVP
- AI utilities: LangChain only for prompt templates, provider adapters, structured output helpers, or future tool integration
- Speech: browser microphone capture, STT/TTS abstraction, and mock providers for local demo
- Env: `.env.local` for optional AI model, STT, and TTS provider keys

Current implementation status:

- Implemented: username/phone account parsing, RLS migrations, Supabase-backed TTS provider preference, `/api/tts`, Xunfei/Volcengine/Tencent provider adapters, Settings provider switch, and accent capability gating.
- Active optimization plan: see `docs/product-optimization-plan.md` for conversation correction UX, identity display, non-ID view models, localization cleanup, and reliability polish.
- Requires external setup: Supabase migrations, Vercel/server environment variables, and real TTS provider account credentials.
- Not fully verified without credentials: real provider audio output, provider-specific English voice quality, and exact multi-accent voice availability.
- Structural docs added: `docs/project-structure.md` for frontend/backend-style layering without a full repo split.

Cost-control requirements:

- Use mock providers for initial development and tests.
- Defer paid provider integration until the voice loop and correction UX are validated.
- Use hosted persistence because login, mobile access, and cross-device history are core to the product.
- Keep the deployed MVP usable from desktop and mobile from the start.
- Keep the conversation model choice replaceable so DeepSeek remains a default, not a lock-in.

## Validation

```bash
npm run build
npm test
npm run dev
```

## Risks

- Browser speech support varies by platform.
- Mic permission handling must be explicit and testable.
- Mock mode must be good enough to demo without external keys.
- Theme tokens must be used consistently from the start.
- LangGraph should stay limited to conversation/correction/session-summary flow; do not use it for simple CRUD.
- LangChain should stay optional in v1; Vercel AI SDK should remain the primary AI streaming layer.
- Domestic TTS provider capabilities differ by voice package; keep unsupported accents disabled until a specific voice ID is confirmed.
