# Mobile Audio QA Checklist

Use this checklist for native mobile development builds. Expo config validation is not enough for PR12; real device or simulator QA should record observed behavior here or in the PR notes.

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

## Known Follow-Ups

- Backend STT upload remains a later fallback option; current first path is native speech recognition.
- Lock-screen/background long-running playback is intentionally disabled in current Expo audio config.
- App Store/TestFlight distribution is outside the current local validation scope.
