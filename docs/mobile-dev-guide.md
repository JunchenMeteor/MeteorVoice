# Mobile Development Guide

## Overview

The mobile client is an Expo React Native app in `apps/mobile/`. It shares types, scenarios, and session logic with the Web client via `packages/shared`, `packages/api-client`, and `packages/session-core`.

For architecture decisions, see `docs/adr/`.

## Prerequisites

- Node.js 20+
- Xcode 15+ (iOS builds, Mac only)
- An iOS device or simulator
- A running MeteorVoice Web/API server (local or remote)

## Local Development Build

Expo Go does not support native audio or speech recognition. You must use a development build.

```bash
cd apps/mobile
npx expo run:ios
```

This compiles the native layer and installs the app on a connected device or simulator. Required for testing audio, microphone, and background keep-alive.

## EAS Cloud Build

For builds without a local Mac:

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build --platform ios --profile preview
```

The `preview` profile generates a `.ipa` installable via Xcode → Devices. No App Store submission required.

## Environment Configuration

Set the API base URL in `apps/mobile/app.json`:

```json
"extra": {
  "apiBaseUrl": "https://meteorvoice.jcmeteor.com",
  "apiBaseUrlPreview": "https://mv-pre.jcmeteor.com"
}
```

API base URL resolution:

1. EAS build profiles set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/eas.json`.
   - `development` and `preview` use `https://mv-pre.jcmeteor.com`.
   - `production` uses `https://meteorvoice.jcmeteor.com`.
2. `EXPO_PUBLIC_API_BASE_URL` wins when set manually.
3. If no env is set, development builds default to `apiBaseUrlPreview`, and release builds default to `apiBaseUrl`.

Use an explicit `EXPO_PUBLIC_API_BASE_URL` when testing against a local Web/API server.

For local device testing, the Settings screen API URL field is persisted in SecureStore. Enter the LAN URL once, for example `http://192.168.1.20:3000`, and the app will reuse it on restart until it is cleared or reset to the profile default.

If the preview domain has Vercel Deployment Protection enabled, mobile requests to preview APIs will receive the Vercel authentication page instead of JSON. Disable protection for the API preview domain or configure a trusted/bypass path before using preview as the mobile default.

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root component, session state, preference sync |
| `src/mobileConfig.ts` | API base URL resolution for local, preview, and production |
| `src/nativeAudio.ts` | Audio playback via `expo-audio` |
| `src/nativeSpeech.ts` | Speech recognition via `expo-speech-recognition` |
| `src/mobileAuth.ts` | Supabase auth for mobile |
| `src/mobilePreferences.ts` | Pull/push preferences from the API |
| `src/ThemeProvider.tsx` | Theme state with SecureStore persistence |
| `src/screens/` | Screen components (Session, Home, History, Settings) |

## Audio Session Notes

iOS audio routing requires `AVAudioSession` category `PlayAndRecord` with `allowBluetooth` to support Bluetooth microphone input. This is configured in `app.json` under the `expo-audio` plugin.

Background audio keep-alive is enabled via `UIBackgroundModes: audio` in `app.json`. This only works in development builds and EAS builds, not Expo Go.

## Speech Recognition Notes

The speech recognizer is fixed to `lang: en-US` regardless of device system language. This ensures English is recognized as the primary language even on Chinese-language devices.

## QA Checklist

Before marking mobile audio as production-ready, run through `docs/mobile-audio-qa-checklist.md` on a real device.

## Troubleshooting

**App crashes on audio start**: Check that `expo-audio` and `expo-speech-recognition` are installed and the native build is up to date (`npx expo run:ios` again after `package.json` changes).

**Bluetooth mic not recording**: Verify `iosAudioSessionCategoryOptions` includes `allowBluetooth` in `app.json`. Rebuild after changing `app.json`.

**Speech recognition not available**: The device must support `SFSpeechRecognizer`. Simulators support it; some older devices may not.
