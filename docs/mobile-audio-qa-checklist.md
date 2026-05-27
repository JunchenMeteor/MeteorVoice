# Mobile Audio QA Checklist

Use this checklist for native mobile development builds. Expo config validation is not enough for mobile audio sign-off; real device or simulator QA should record observed behavior here or in the PR notes.

## Current QA Status

- Automated checks cover TypeScript, Expo public config, lint, tests, and Web build.
- Manual native-device QA is still required before treating Mobile audio as production-ready.
- iOS Safari/Chrome Web playback limitations are not the primary Mobile path anymore; the native app must be validated through a development build that includes `expo-audio` and `expo-speech-recognition`.

## Setup

- Build target: iOS simulator, iOS device, or Android emulator/device.
- API base URL points to a reachable MeteorVoice Web/API server.
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set when auth/session sync is being tested.
- Device volume is audible; on iOS also test with the silent switch on and off.

## Playback

- Start a mobile session, send a text turn, and confirm the coach TTS plays through the speaker.
- Tap replay repeatedly; only one replay should run at a time.
- Background the app during playback; playback should pause and the audio state should show a paused/recoverable status.
- Return foreground and replay; playback should recover without restarting the app.
- Test an invalid API base URL; playback errors should be visible and should not move the session into listening.

## Recording

- Tap native mic and grant permission; recording status and duration should update.
- Stop recording; a recording URI should appear.
- Deny microphone permission; the app should show a blocked/error state and remain usable.
- Tap native mic while coach TTS is playing; recording should be blocked until playback finishes.
- Tap start/stop rapidly; duplicate concurrent audio operations should be blocked.
- Background the app while recording; recording should stop and the app should show a paused/recoverable state.

## Native Speech Recognition

- Tap `Speak instead`, grant speech recognition and microphone permissions, and confirm the speech state enters listening.
- Speak one short English sentence and stop; the final transcript should populate the input and submit through the existing chat/TTS flow.
- Speak an English sentence with a Chinese word; if the native recognizer returns the Chinese text, the AI should briefly explain the Chinese word aloud and add a vocabulary correction.
- Deny speech recognition permission; the app should show a visible unavailable/error state while text input remains usable.
- Start native speech while coach TTS is playing; speech should be blocked until playback finishes.
- Use text input fallback after a native speech error; the session should continue without restarting.

## TTS Sentence Playback

- Send a multi-sentence coach reply and confirm the first sentence starts playback before the full reply would normally finish synthesizing.
- Confirm later sentence audio plays in order without overlapping the first sentence.
- Interrupt by backgrounding the app during queued playback; playback should pause/recover without starting two voices.
- Tap replay after queued playback finishes; only the current reply should replay.

## Session Flow

- Complete at least three consecutive turns with TTS playback and native mic test between turns.
- Confirm Corrections and Transcript tabs remain responsive while audio controls are used.
- End the session and confirm summary generation does not start recording or playback.
- If signed in, confirm session sync/history calls still use the mobile bearer token.

## Device Routes

- Test speaker output.
- Test with Bluetooth audio connected.
- Test with headphones connected.
- On iOS, confirm audio does not incorrectly route through the earpiece during playback.

## Execution Record Template

Copy this block into PR notes after a real-device run:

```md
### Mobile Audio QA

- Build: iOS simulator / iOS device / Android emulator / Android device
- Device and OS:
- API base URL:
- Auth tested: yes/no
- Native speech short sentence: pass/fail, notes
- Native speech mixed English-Chinese: pass/fail, notes
- TTS sentence queue: pass/fail, notes
- Playback during silent switch / background / Bluetooth: pass/fail, notes
- Corrections + Transcript after 3 turns: pass/fail, notes
- Known device-specific issues:
```

## Known Follow-Ups

- Backend STT upload remains a later fallback option; current first path is native speech recognition.
- Lock-screen/background long-running playback is intentionally disabled in current Expo audio config.
- App Store/TestFlight distribution is outside the current local validation scope.
