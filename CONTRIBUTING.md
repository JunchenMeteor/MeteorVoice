# Contributing to MeteorVoice

Language: [English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh-CN.md)

## Before You Start

Read `docs/development-rules.md` and `docs/project-structure.md` first. They define the layering rules and coding standards that all contributions must follow.

## Branch Naming

```
dev/<your-handle>/<lowerCamelOrSnakeName>
```

Examples: `dev/alice/fixAudioRoute`, `dev/bob/azure_tts`

Always branch from the latest `main`:

```bash
git fetch upstream
git checkout -b dev/<your-handle>/<topic> upstream/main
```

## Making Changes

- Keep changes scoped to the task. Do not clean up unrelated code in the same PR.
- Match the existing code style, patterns, and dependencies. Do not introduce new libraries without discussion.
- Server-side secrets stay in environment variables only. Never commit credentials.
- Native mobile code must not import Web-only or server-only modules.

## Commit Messages

Short imperative sentence. No co-author credits.

```
Fix audio route not switching to Bluetooth on iOS
Add Azure Neural TTS provider
```

## Pull Requests

- Title: short imperative sentence, no `[xxx]` prefix
- Body sections: `## Summary`, `## Proposed Changes`, `## Test Plan`
- Link the related issue with `Closes #<number>` at the end of the body
- One PR per logical change

## Issues

Title prefix must be one of:

| Prefix | Use for |
|--------|---------|
| `[Feature]` | New features, improvements, refactors, maintenance |
| `[Bug]` | Defects and regressions |
| `[Test]` | Test coverage work requiring a code commit |
| `[Documentation]` | Docs only |
| `[Security]` | Security hardening |

## Running Tests

```bash
npx vitest run        # unit tests
npm run build         # production build check (from apps/web)
```

For mobile QA, follow `docs/mobile-audio-qa-checklist.md`.

## Questions

Open an issue with `[Feature]` or `[Documentation]` prefix to start a discussion.
