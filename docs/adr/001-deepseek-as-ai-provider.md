# ADR-001: Use DeepSeek as AI Provider

## Status

Accepted

## Background

MeteorVoice needs an LLM to generate coach replies and correction feedback in real time. The model must support structured JSON output, have low latency for conversational use, and be cost-effective at low-to-medium traffic.

## Decision

Use DeepSeek (`deepseek-chat`) via the Vercel AI SDK.

## Rationale

- Price is roughly 10x lower than GPT-4 at equivalent quality for English conversation tasks.
- Supports JSON mode natively, which is required for the structured `{ text, corrections }` reply format.
- Vercel AI SDK provides a provider-agnostic interface; switching to another model requires changing one line.
- `deepseek-chat` latency is acceptable for turn-based conversation (typically under 2 seconds for short replies).

## Consequences

- Depends on DeepSeek service availability. If DeepSeek is unreachable, the app falls back to mock AI.
- Access from mainland China may require a proxy or alternative base URL (`DEEPSEEK_BASE_URL`).
- Model behavior may differ from GPT-4 on edge cases; prompt tuning is DeepSeek-specific.
