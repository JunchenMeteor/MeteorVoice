# Native Mobile Completion Status

本文档是 native mobile 架构升级 completion pass 的状态记录。它不替代 `docs/architecture-productization-roadmap.md`，只记录当前架构升级已经具备的能力、验证方式和已知限制。

## 已完成能力

- `packages/shared`
  - 跨端 conversation/correction、speech、scenario、accent、locale 类型和配置。
- `packages/api-client`
  - 可注入 `baseUrl`、`fetch`、静态/动态 headers。
  - 覆盖 preferences、chat、tts、session sync、summary、history、turns、session create/update。
  - 支持 mobile bearer token 调用需要身份的 API。
- `packages/session-core`
  - 平台无关 workflow snapshot、transition、turn guard helpers。
  - 已包含双端可复用的 turn lifecycle、request/receive coach reply、playback completion、route pause、error recovery、continue listening、end session 和 TTS playback queue 纯函数。
  - Web provider 已切到 session-core 的关键 guard 和部分 orchestration helper。
  - Mobile app 消费 workflow snapshot、turn orchestration 和播放队列规则。
- `apps/mobile`
  - Expo React Native app，非 WebView。
  - Supabase email/password auth，SecureStore session persistence。
  - Scenario/accent selection from `packages/shared`。
  - Text/native speech turn -> `/api/chat` -> `/api/tts` -> native playback。
  - Native speech recognition adapter 已接入 `expo-speech-recognition`，业务 UI 通过 `apps/mobile/src/nativeSpeech.ts` 调用。
  - TTS sentence pipeline 已接入，首句先播放，后续音频按队列顺序播放。
  - Native recording/playback adapter，包含权限、前后台、并发操作保护。
  - Mobile session UX：start/continue/end、current subtitles、Corrections/Transcript tabs、summary、history/review、settings/preferences。
  - Mobile 会话页已从 architecture probe 调整为正式 Voice Practice 布局，核心说话舞台前置。
- Server auth bridge
  - `apps/web/lib/supabase/server.ts` 同时支持 Web cookie 和 mobile bearer token。
- Docs
  - Architecture plan、audio QA checklist、local build runbook、deployment runbook 均已记录。
- `apps/web`
  - Web app 已迁入 `apps/web`。
  - 根目录 `dev`、`build`、`start` 通过 workspace scripts 调用 Web app。

## 当前验证命令

```bash
npm run lint
npm test
npm run mobile:config
npm run mobile:typecheck
```

Mobile 本地运行：

```bash
npm run mobile:start
npm run mobile:ios
npm run mobile:android
```

## 已知限制

- Mobile native speech recognition 已接入，但仍需要 iOS/Android development build 真机记录；Expo Go 不能作为完整验收。
- Backend STT upload 仍是后续 fallback 方案，当前主路径是设备 native speech recognition。
- Mobile settings、default scenario/accent、TTS provider 和 speed 已走 preferences API；仍需要跨设备实际账号回归。
- History/review 已有 session turn detail API；audio replay metadata 仍可后续扩展。
- 未提交 generated native `ios/`、`android/` 工程目录；当前仍以 Expo managed + local development build 为主。

## 后续产品化入口

- 后续应按 `docs/architecture-productization-roadmap.md` 继续推进：
  - 真机 QA 记录和设备差异修复。
  - session-core 继续抽离，尤其是 Web `VoiceSessionProvider` 中剩余的 turn lifecycle 和平台 adapter 边界。
  - API 契约继续产品化，尤其是 audio replay metadata、review DTO 和错误恢复语义。
  - 口音与语音能力专项。

## 产品化推进记录

- 已补齐第一轮 workspace 验证脚本和 Mobile typecheck 配置。
- 已新增 API DTO/routes：scenarios、accents、session turn detail。
- Preferences API 已扩展 locale、默认 scenario/accent 和 TTS speed，并配套 Supabase migration。
- Mobile 已接入新增 API，用于远端场景/口音能力、默认练习设置保存和历史 turn detail 查看。
- session-core 已新增平台无关 next action、no-speech、playback restore、end-session、coach reply orchestration、route pause、error recovery 和 playback queue 判断。
- Mobile 已接入 native speech adapter、TTS sentence playback queue 和正式练习页布局。
- CI 已补齐 GitHub Actions 基础流程：lint、mobile typecheck/config、test 和 web build。
- 口音与语音能力专项仍未开始。
