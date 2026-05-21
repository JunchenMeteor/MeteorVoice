# Native Mobile Completion Status

本文档是 PR14 completion pass 的状态记录。它不替代 `docs/native-mobile-architecture-plan.md`，只记录当前架构升级已经具备的能力、验证方式和剩余收尾。

## 已完成能力

- `packages/shared`
  - 跨端 conversation/correction、speech、scenario、accent、locale 类型和配置。
- `packages/api-client`
  - 可注入 `baseUrl`、`fetch`、静态/动态 headers。
  - 覆盖 preferences、chat、tts、session sync、summary、history、turns、session create/update。
  - 支持 mobile bearer token 调用需要身份的 API。
- `packages/session-core`
  - 平台无关 workflow snapshot、transition、turn guard helpers。
  - Web provider 已切到 session-core 的关键 guard。
  - Mobile probe 消费 workflow snapshot。
- `apps/mobile`
  - Expo React Native app，非 WebView。
  - Supabase email/password auth，SecureStore session persistence。
  - Scenario/accent selection from `packages/shared`。
  - Text turn -> `/api/chat` -> `/api/tts` -> native playback。
  - Native recording/playback adapter，包含权限、前后台、并发操作保护。
  - Mobile session UX：start/continue/end、current subtitles、Corrections/Transcript tabs、summary、history/review、settings/preferences。
- Server auth bridge
  - `lib/supabase/server.ts` 同时支持 Web cookie 和 mobile bearer token。
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
```

Mobile 本地运行：

```bash
npm run mobile:start
npm run mobile:ios
npm run mobile:android
```

## 已知限制

- Mobile 语音输入仍是 native recording probe + text turn；完整 STT upload/native speech recognition 需要后续专项接入。
- Mobile settings 中 TTS speed 当前是本地状态，provider 已走 preferences API；默认 scenario/accent 的跨设备偏好同步可在 preferences API 扩展后补齐。
- History/review 使用现有 `/api/history` 聚合结果，尚未提供完整 turn detail API。
- 未提交 generated native `ios/`、`android/` 工程目录；当前仍以 Expo managed + local development build 为主。

## 剩余架构收尾

- 从 `dev/architecture/native-mobile` 向 `main` 提最终集成 PR。
- 暂不合入 `release`，除非产品负责人确认。
