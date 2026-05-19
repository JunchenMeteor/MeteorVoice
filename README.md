# MeteorVoice

<p align="center">
  <strong>An English speaking coach with voice chat, live correction, accent rotation, and cross-device sync</strong>
</p>

<p align="center">
  <a href="README.md"><img alt="Docs English" src="https://img.shields.io/badge/Docs-English-black" /></a>
  <a href="README.zh-CN.md"><img alt="Docs 中文" src="https://img.shields.io/badge/Docs-%E4%B8%AD%E6%96%87-red" /></a>
</p>

## Table of Contents

- [Overview](#overview)
- [Core Capabilities](#core-capabilities)
- [System Architecture](#system-architecture)
- [Repository Structure](#repository-structure)
- [Setup](#setup)
- [Authentication](#authentication)
- [Persistence](#persistence)
- [TTS](#tts)
- [Project Structure](#project-structure)
- [Run](#run)
- [Validation](#validation)

## Overview

MeteorVoice is a voice-first English conversation coach. It keeps the loop simple: the user starts a session, speaks, gets live corrections, hears a reply with an accent, and continues or ends the session.

The app is built as a single Next.js full-stack repo. UI pages, API routes, shared providers, and Supabase helpers live in one codebase.

## Core Capabilities

- One-to-one English practice
- Scenario-based conversation starters
- Live correction and end-of-turn feedback
- Accent rotation across sessions
- Bilingual app UI outside the conversation area
- Theme switching with CSS tokens
- Login, history, and preference sync through Supabase
- Mock AI/STT/TTS providers for local development

## System Architecture

- **Framework**: Next.js + TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **AI streaming**: Vercel AI SDK
- **Conversation workflow**: LangGraph as an in-app workflow layer
- **Database/Auth**: Supabase
- **Voice**: browser STT/TTS abstractions with provider adapters

## Repository Structure

- `app/` - pages and API routes
- `components/` - reusable UI components
- `lib/` - shared providers, workflows, and helpers
- `supabase/` - database migrations
- `docs/` - product and implementation docs

## Setup

```bash
cd MeteorVoice
npm ci
cp .env.local.example .env.local
```

### Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_init.sql`
3. Run `supabase/migrations/002_rls.sql`
4. Copy the project URL and anon key into `.env.local`
5. Set Authentication redirect URLs for local development

## Authentication

MeteorVoice follows the MeteorTest pattern for account input.

- One account field accepts `username`, `phone`, or email
- Username is converted to an internal email alias before Supabase auth
- Phone is passed directly to Supabase phone auth
- The visible identity stays username or phone; the alias is internal only

## Persistence

Supabase stores sessions, turns, correction items, theme preferences, and learning history.

Current migration state:

- `001_init.sql` creates the schema and seed data
- `002_rls.sql` enables RLS and user-owned access policies
- `003_tts_preferences.sql` adds the per-user TTS provider preference

## TTS

Domestic providers are the recommended real voice path for users in China: Xunfei first, with Volcengine and Tencent Cloud available as alternatives.

The app stores each user's selected voice provider in Supabase. Provider credentials stay in server-side environment variables.

See `docs/tts-integration.md` and `docs/supabase-setup.md`.

## Project Structure

See `docs/project-structure.md` for the frontend/backend-like layering rules used in this repo.

## Run

```bash
npm run dev
```

Open `http://127.0.0.1:3001`

## Validation

```bash
npm run build
npm test
```

## Notes

- `DEEPSEEK_API_KEY` is optional.
- Mock providers keep the app runnable without real AI or speech keys.
