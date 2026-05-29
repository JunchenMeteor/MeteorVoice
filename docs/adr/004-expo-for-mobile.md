# ADR-004: Use Expo React Native for Mobile

## Status

Accepted

## Background

MeteorVoice needs a native iOS and Android client that can access the device microphone, play audio in the background, and use native speech recognition. The team has stronger JavaScript/TypeScript experience than Swift or Kotlin.

## Decision

Use Expo React Native (`expo-audio`, `expo-speech-recognition`) for the mobile client.

## Rationale

- Shared TypeScript codebase with the Web client via `packages/shared`, `packages/api-client`, and `packages/session-core`.
- `expo-audio` and `expo-speech-recognition` provide native audio and speech APIs without writing Swift/Kotlin.
- EAS Build produces `.ipa` and `.apk` without requiring a local Mac for every build.
- Background audio keep-alive (`UIBackgroundModes: audio`) is supported via `app.json` config.

## Consequences

- Some native capabilities (background audio, Bluetooth audio routing) require a development build or EAS build — they cannot be tested in Expo Go.
- Expo SDK upgrades may require coordinated changes across `app.json`, native modules, and `package.json`.
- Native module behavior (especially audio session routing on iOS) may differ from Web behavior and requires separate QA. See `docs/mobile-audio-qa-checklist.md`.
