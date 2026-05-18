# MeteorVoice

Practice spoken English through voice conversation with an AI coach. Scenario-based learning with real-time corrections, accent adaptation, and theme customization.

## Setup

```bash
cd english-conversation-coach
npm ci
cp .env.local.example .env.local
```

### Supabase (required for auth and persistence)

1. Create a free project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_init.sql` in the SQL Editor
3. Copy your Project URL and anon key to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. In Authentication → URL Configuration, set:
   - Site URL: `http://127.0.0.1:3001`
   - Redirect URLs: `http://127.0.0.1:3001/**`

### DeepSeek (optional — app works in mock mode without it)

```
DEEPSEEK_API_KEY=sk-...
```

## Run

```bash
npm run dev
```

Open http://127.0.0.1:3001

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm test` | Type-check and build |

## Architecture

### AI Layer

MeteorVoice uses a layered AI architecture:

1. **Provider abstraction** (`lib/providers/types.ts`) — STT, TTS, and AI are all behind interfaces, making providers replaceable without touching UI code
2. **Vercel AI SDK** (`lib/providers/ai-provider.ts`) — primary AI streaming layer, currently configured for DeepSeek via OpenAI-compatible adapter
3. **LangGraph workflow** (`lib/conversation-workflow.ts`) — 7-state state machine for voice session lifecycle, embedded in the app backend (no separate LangGraph server)
4. **Mock layer** — all providers have mock implementations so the app runs without API keys

**Cost rationale:** DeepSeek is chosen as the default model for its low cost ($0.14/1M input tokens, $0.28/1M output tokens) and strong English performance. The Vercel AI SDK provider boundary means switching to another model requires only changing the provider adapter.

### Cloud Persistence

**Choice: Supabase** — provides auth, Postgres database, and row-level security in one managed service. Free tier covers the MVP. The alternative (SQLite) would block mobile access and cross-device sync, which are core product requirements.

### LangGraph Boundary

LangGraph is used only for the conversation workflow (listening → transcribing → thinking → speaking → correcting → idle → ended). It is NOT used for CRUD operations, auth, or settings. The conversation workflow is isolated in `lib/conversation-workflow.ts`.

## Theme System

6 themes via CSS custom properties: Default Calm, Conversation, Night, Learning, Bright, Playful. Toggle in Settings.

## Phase 1 Scope

- Auth (login/signup with Supabase)
- Scenario selection (interview, travel, small-talk, restaurant, workplace)
- Voice conversation loop (mock STT/TTS/AI out of the box)
- Session start/end with localStorage history
- 6 themes with CSS token system
- AI provider abstraction (DeepSeek when API key is provided, mock otherwise)
- LangGraph conversation workflow

### Deferred

- Production STT/TTS integration (paid keys needed)
- Real DeepSeek testing (API key needed)
- Supabase-synced history (currently localStorage)
- RLS policies for multi-user
