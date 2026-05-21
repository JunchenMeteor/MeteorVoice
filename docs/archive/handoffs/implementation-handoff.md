# Implementation Handoff

## Project

English Conversation Coach

## Read First

1. `ai-workflow/english-conversation-coach/spec.md`
2. `ai-workflow/english-conversation-coach/plan.md`
3. `ai-workflow/english-conversation-coach/one-shot-prompt.md`

For later phases, use the matching phase-specific handoff file in the same folder.

## Start Scope

Implement Phase 1 first:

- auth
- scenario selection
- active voice session lifecycle
- session start/end
- mock STT/TTS/AI providers
- low-cost cloud-accessible TypeScript web app shell; recommended default is Next.js + TypeScript
- cloud persistence and sync; recommended default is Supabase or similar managed backend
- theme-token UI baseline; recommended default is shadcn/ui + Tailwind
- AI provider abstraction with mock fallback; recommended default is Vercel AI SDK
- current default conversation model: DeepSeek, but keep the model boundary replaceable
- LangGraph conversation workflow service embedded in the app backend, not a separate LangGraph server
- basic theme switching
- mobile and desktop accessibility from the start

## Do Not Implement Yet

- production speech provider integration
- paid AI provider integration
- broad LangChain agent/tool platform
- separate LangGraph server or LangGraph Platform deployment
- charts before review/history data exists
- low-code platform runtime integration
- AI coding tool SDK integration inside the app runtime
- full curriculum
- social features
- background listening

## Required Commands

```bash
npm run build
npm test
npm run dev
```

## Expected Output

- complete runnable app
- setup instructions
- mock provider mode
- `.env.local.example` for AI/STT/TTS provider keys
- documented AI layer choice and cost rationale
- cloud persistence choice and sync rationale
- documented LangGraph boundary, limited to conversation workflow
- validation results
- notes for blocked or deferred items

## Chronicle Requirement

After meaningful work, write a chronicle entry under:

```text
ai-workflow/english-conversation-coach/chronicle/YYYY-MM-DD.md
```
