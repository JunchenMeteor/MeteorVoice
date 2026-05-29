# MeteorVoice

English conversation coach using voice I/O with AI-powered real-time correction and accent adaptation.

## Commands

```bash
npm run dev      # dev server at http://127.0.0.1:3001
npm run build    # production build
npm test         # type-check + build
```

## Tech Stack

- **Framework:** Next.js 16 + TypeScript
- **UI:** shadcn/ui + Tailwind CSS + CSS custom property theme tokens (6 themes)
- **Auth / DB / Storage:** Supabase (remote project)
- **AI SDK:** Vercel AI SDK (`ai` + `@ai-sdk/openai`) with DeepSeek as default model
- **Conversation workflow:** LangGraph state machine (7 states) embedded in-app
- **Deploy:** Vercel (https://meteorvoice.jcmeteor.com)

## Reference Docs

All spec, plan, and implementation handoff files live in `docs/`:
- `docs/spec.md`
- `docs/plan.md`
- `docs/implementation-handoff.md` (Phase 1)
- `docs/implementation-handoff-phase-2.md`
- `docs/implementation-handoff-phase-3.md`
- `docs/implementation-handoff-phase-4.md`
- `docs/one-shot-prompt.md`
- `docs/chronicle/`

## GitHub Rules

- Branch naming: `dev/<description>/<feature>` (e.g., `dev/fix/move-ai-to-server-side`)
- Issue/PR titles must be English and use one of: `[Feature]`, `[Fix]`, `[Docs]`, `[Refactor]`, `[Chore]`, `[TTS]`, `[Mobile]`; release items may start with `Release ...` without a bracket prefix.
- Issue/PR body must include: `## Summary`, `## Test Plan`. Issues additionally: `## Expected Behavior`, `## Proposed Changes`. PRs additionally: `Closes #<issue>`
- Labels: `[Feature]` -> `enhancement`, `[Fix]` -> `bug`, `[Docs]` -> `documentation`, `[Refactor]` -> `refactor`, `[Chore]` -> `chore`, `[TTS]` -> `tts`, `[Mobile]` -> `mobile`, `Release ...` -> `release`. Add domain labels together when applicable, such as `bug` + `mobile` + `tts`.
- Push via SSH: `git@github.com:JunchenMeteor/MeteorVoice.git`
- Always work on a separate branch, create issue and PR for every change
- Git commit messages must NOT include `Co-Authored-By` or any AI author attribution
- Git commit messages must NOT use bracket prefixes like `[Fix]`, `[Feature]`, etc. — those are for Issue/PR titles only
- Issue/PR titles and bodies must NOT mention Claude, AI tools, or any AI attribution
- Release policy: `main` is the integration/preview branch; production releases come from `release`. When publishing, merge all changes from `main` since the last release into `release`; do not cherry-pick selectively unless the user explicitly requests an emergency hotfix, and sync any hotfix back to `main`.

## Environment

- `.env.local` — local dev credentials (never committed)
- `.env.local.example` — template
- Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`
