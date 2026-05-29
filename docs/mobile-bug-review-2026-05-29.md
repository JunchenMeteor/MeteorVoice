# Mobile Bug Review - 2026-05-29

This document records the mobile-focused review and fixes from 2026-05-29. It complements `docs/native-mobile-completion-status.md` and `docs/mobile-audio-qa-checklist.md`.

## Review Summary

The Web/API/shared-package architecture is in good shape for continued iteration. The mobile app has the right native-client skeleton, but the risk remains in native audio/speech lifecycle, provider capability sync, and device QA.

Validation after fixes:

- `npm run mobile:typecheck` passes.
- Full Web/package regression should still be run before merge: `npm test`.
- Native device QA is still required for iOS/Android audio route, Bluetooth, background/foreground, and speech recognition behavior.

## Issues and Status

| Area | Issue | Status | Notes |
| --- | --- | --- | --- |
| Mobile validation | `expo-speech-recognition` was missing from the local install tree, blocking `mobile:typecheck`. | Fixed locally | `npm install` reconciled `node_modules` with `package-lock.json`; no lockfile change was needed. |
| Speech/playback loop | Native speech could remain active while coach TTS was playing, causing the app to hear the coach reply as user input and loop. | Fixed in code | Mobile now cancels native speech before TTS playback/correction playback, blocks transcripts while playback is active, and restarts listening only after playback finishes and the route is active. |
| Background/foreground | Stale speech/endpointing work could survive route/background changes and surface as request failures after returning. | Fixed in code | AppState background now pauses listening, invalidates pending endpoint requests, clears pending transcript, and resumes listening only when active again. |
| Permission prompt | Returning to foreground requested microphone permission instead of checking it. | Fixed in code | `nativeAudio` now uses `getRecordingPermissionsAsync()` on foreground. |
| Text fallback | Mobile session UI had no text fallback, despite the roadmap requiring one. | Fixed in code | Active sessions now show a typed fallback input that uses the same turn submission path. |
| TTS voice selection | Mobile saved `tts_voice_id`, but `/api/tts` requests did not pass `voiceId`. | Fixed in code | API client type and mobile TTS requests now include `voiceId`. |
| TTS sentence queue | Mobile docs/tests mentioned sentence playback, but Web had already moved away from this approach. | Not adopted | Mobile stays on full-reply TTS for now. Reintroduce sentence/chunk playback only through a separate product decision and device QA plan. |
| Correction playback | Correction replay could leave correction playback state set and affect the next normal coach playback completion. | Fixed in code | Correction playback completion is handled before normal queue advancement and clears the playback guard. |
| Provider list sync | Mobile could show only `mock` until a manual reload or authenticated preference pull, even when Web showed Azure/Xunfei. | Fixed in code | Mobile now loads public server preferences/provider capability on startup/API URL changes and still pulls signed-in preferences when authenticated. |
| Xunfei voice catalog | Mobile catalog visibility depends on the same `/api/preferences` response as Web, but was easy to miss because provider capability was not loaded eagerly. | Fixed in code | Keep catalog/configuration on the server for now; database storage is not required unless an admin-managed voice catalog is needed later. |
| Preview/production split | Mobile default API URL did not distinguish preview development from production release. | Fixed in code/config | EAS `development`/`preview` profiles set `EXPO_PUBLIC_API_BASE_URL` to preview, and `production` sets it to production. Existing manual `EXPO_PUBLIC_API_BASE_URL` remains the local/emergency override. |
| Bluetooth/audio route QA | Bluetooth/headphone route behavior has not been re-tested. | Pending QA | Must be covered in `docs/mobile-audio-qa-checklist.md` before calling mobile audio production-ready. |

## Implementation Notes

- Mobile speech recognition is treated as an exclusive input source. When playback starts, native speech is canceled and any final transcript arriving during playback is ignored.
- Backgrounding an active session intentionally pauses listening instead of keeping microphone capture alive.
- Foreground resume restores listening only if the session is still active, no request is busy, and playback is not active.
- Provider capability remains server-derived. Azure appearing in Mobile requires the Mobile API base URL to point at the same server/env where Azure is configured.
- Sentence/chunk playback is intentionally not enabled in Mobile in this bugfix pass, matching the current Web product direction.
- Preview APIs behind Vercel Deployment Protection return an auth page instead of JSON. If Mobile defaults to preview, the preview API domain must be accessible to the app or configured with an automation bypass/trusted source.

## Remaining QA

Before treating the mobile voice loop as production-ready, run the checklist in `docs/mobile-audio-qa-checklist.md` on:

- iOS simulator or iOS device development build.
- Android emulator or Android device development build.
- Speaker, wired/headphone, and Bluetooth audio routes.
- Background during listening, background during playback, foreground resume, and repeated start/end cycles.
