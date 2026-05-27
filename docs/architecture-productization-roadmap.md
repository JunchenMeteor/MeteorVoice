# Architecture Productization Roadmap

本文档是 MeteorVoice 双端架构升级后的后续产品化路线图。后续 AI agent 在处理文档清理、native mobile、session-core、API 契约或 workspace 工程化任务前，MUST 先读本文件，再读 `docs/project-structure.md` 和 `docs/native-mobile-architecture-plan.md`。

## 当前判断

`main` 已经具备专业双端架构骨架：

- `apps/web` 承载 Next.js Web、API routes、Web-only providers 和 server-side orchestration。
- `apps/mobile` 承载 Expo React Native native client，不是 WebView shell。
- `packages/shared` 承载跨端类型、i18n、scenario、accent、speech capability。
- `packages/api-client` 承载跨端 typed API client。
- `packages/session-core` 承载平台无关 workflow 和 turn guard。

当前状态不是临时拼接，但还不是完整移动端产品化。后续目标是把 mobile 从“业务探针”推进到“可持续迭代的 native client”，同时让 Web/API/session-core 的边界更加稳定。

## 当前实施进度

- Phase A 文档收口已完成：当前入口指向 monorepo 路径，已完成计划移动到 `docs/archive/plans/`。
- Phase B workspace 工程化已完成第一轮：根目录提供 `web:lint`、`web:build`、`mobile:config`、`mobile:typecheck`、`packages:test`，Mobile 有独立 `tsconfig.json`；CI workflow 已补齐基础 lint/typecheck/config/test/build。
- Phase C API 契约已完成第一轮：新增 scenarios、accents、session turn detail API；preferences API 扩展 locale、默认 scenario/accent、TTS speed；`packages/api-client` 提供 typed methods。
- Phase D session-core 已完成第三轮：新增 next action、transcript acceptance、no-speech、playback restore、end-session、playback block、turn lifecycle、coach reply receive/playback completion、route pause、error recovery effect mapping 和 playback queue 规则。
- Phase E mobile 产品化已完成第二轮：Mobile app 消费新增 API 契约，加载远端 scenario/accent capability，保存练习默认偏好，查看 session turn detail，并继续使用 native audio adapter 做录音/播放硬化。PR 1 low-latency turn rules、PR 2 mobile native speech adapter、PR 3 TTS sentence pipeline 已按计划推进；Mobile 会话页已从 probe 调整为正式 Voice Practice 布局。语音 endpointing 已改为文本规则 + activity/VAD 信号组合，详见 `docs/session-endpointing-vad.md`。
- Phase F 尚未开始，按用户要求暂不做。

## 优先级顺序

后续工作 SHOULD 按以下顺序推进，除非用户明确要求先处理线上 bug：

1. 文档和规则收口。
2. Workspace 工程化补齐。
3. API 契约产品化。
4. session-core 继续抽离。
5. Mobile 语音闭环产品化。
6. 口音与语音能力专项。

每个阶段 SHOULD 独立 issue/PR，避免把文档整理、native audio、API DTO 和 UI 体验混在同一个 PR。

## Phase A: 文档和规则收口

目标：让 AI 和人工开发不再被旧路径、旧阶段计划或过期状态误导。

范围：

- `docs/index.md` MUST 只把当前有效文档列为入口。
- 已完成且不再指导当前开发的计划 SHOULD 移入 `docs/archive/`，保留历史但不作为执行规则。
- 所有当前文档中的路径 MUST 使用 monorepo 路径：
  - Web 页面和 API：`apps/web/app/...`
  - Web 组件：`apps/web/components/...`
  - Web server/provider：`apps/web/lib/server/...`、`apps/web/lib/providers/...`
  - i18n：`packages/shared/src/i18n.ts`
  - scenario/accent/speech：`packages/shared/src/...`
- 文档中不应再把仓库根目录描述为长期 Next.js app 根路径。

验收：

- 搜索旧版根目录路径、旧 i18n 路径和旧 Web session 路径时，结果只应出现在 archive、chronicle 或明确标注为历史的上下文中。
- `docs/index.md` 能在 2 分钟内告诉新 agent：当前该读什么、不要读什么、下一步该做什么。

## Phase B: Workspace 工程化补齐

目标：让 Web、Mobile、packages 的验证能够拆开执行，便于 CI 和本地定位问题。

推荐脚本：

```json
{
  "web:lint": "npm --workspace @meteorvoice/web run lint",
  "web:build": "npm --workspace @meteorvoice/web run build",
  "mobile:config": "npm --workspace @meteorvoice/mobile exec expo config -- --type public",
  "mobile:typecheck": "tsc -p apps/mobile/tsconfig.json --noEmit",
  "packages:test": "vitest run tests/api-client.test.ts tests/session-core.test.ts",
  "test": "vitest run && npm run web:build"
}
```

实施要求：

- 如果 `apps/mobile/tsconfig.json` 不存在，SHOULD 先新增最小可用配置。
- Mobile lint/typecheck 不应依赖 iOS simulator 或 Android emulator。
- 根目录 CI SHOULD 分阶段输出 Web、Mobile、packages 的结果。
- 不要为了脚本整洁移动业务代码。

验收：

- `npm run web:lint`
- `npm run web:build`
- `npm run mobile:config`
- `npm run mobile:typecheck`，如环境暂不支持，PR MUST 说明原因。
- `npm run packages:test`

## Phase C: API 契约产品化

目标：Mobile 不再依赖 Web 页面“刚好够用”的响应结构，而是依赖稳定 DTO。

优先补齐：

- `GET /api/scenarios`
  - 返回 scenario list、localized labels、difficulty、default prompt metadata。
- `GET /api/accents`
  - 返回 accent list、provider support、localized labels、disabled reason。
- `GET /api/history`
  - 返回 session list DTO，避免 UI 直接依赖数据库字段。
- `GET /api/sessions/:id/turns` 或等价 route
  - 返回完整 turn detail、messages、corrections、audio replay metadata。
- `GET/PUT /api/preferences`
  - 覆盖 locale、default scenario、default accent、TTS provider、TTS speed。

实施要求：

- DTO 类型 SHOULD 优先进入 `packages/shared` 或 `packages/api-client/src/types.ts`。
- `packages/api-client` MUST 暴露 typed method，不让 Mobile 拼 URL。
- API 错误 MUST 使用统一可读结构，至少包含 `message` 和 HTTP status。
- Server-side Supabase service role 逻辑 MUST 留在 `apps/web/lib/server` 或 `apps/web/lib/supabase`，禁止进入 client/mobile。

验收：

- API client tests 覆盖新增 DTO method。
- Web 和 Mobile 均通过 API client 或稳定 server helper 消费契约。
- Mobile 不 import `apps/web/*`。

## Phase D: session-core 继续抽离

目标：把“会话怎么流转”的规则留在 `packages/session-core`，把“怎么录音/播放/解锁浏览器音频”留在平台 adapter。

应该进入 `packages/session-core` 的内容：

- session state enum 和合法 transition。
- active turn lock 和 stale turn 判断。
- route/app background pause/resume 决策。
- speaking/listening/thinking/correcting 的 next action 计算。
- silence/no-speech 不生成 synthetic turn 的规则。
- TTS 播放结束后是否恢复 listening 的规则。
- 收到用户 transcript 后如何追加 user message、进入 transcribing、触发 request reply。
- 收到 coach reply 后如何追加 assistant message、进入 speaking、触发 playback。
- 播放完成后如何进入 corrections、恢复 listening 或播放队列下一段。
- end session 时如何进入 terminal state。
- STT/no-speech、coach reply、TTS/playback 等失败时如何回到 recoverable state，并返回错误展示/恢复 effect。

不应进入 `packages/session-core` 的内容：

- Browser Web Speech API。
- Web Audio analyser。
- DOM/localStorage/sessionStorage。
- Expo Audio、AVAudioSession、Android foreground service。
- Supabase/HTTP fetch。
- UI component state。

统一边界：

- Web 和 Mobile 的原生能力不统一：Browser Speech/Web Audio/HTMLAudioElement、Expo Speech/Expo Audio 仍分别留在 `apps/web` 和 `apps/mobile`。
- `packages/session-core` 统一的是平台事件之后的业务编排：transcript accepted、request reply、receive reply、play reply、play next audio、show corrections、show error、recover to idle、restore listening、pause、end。
- `session-core` 只返回 snapshot/messages/effects，不直接 fetch、不播放音频、不操作 DOM、不请求权限。

实施建议：

- 先在 `VoiceSessionProvider` 或 mobile session screen 周边写 characterization tests，锁住现有行为。
- 再把纯函数规则迁入 `packages/session-core`。
- 最后让 Web/Mobile adapter 调用 session-core，而不是复制判断。

验收：

- `packages/session-core` tests 覆盖 happy path、route pause、TTS playing、no-speech、end session、stale turn。
- Web session 和 Mobile session 都只把平台事件转成 core event。
- 不因为抽离改变用户可见行为。

当前状态：

- Mobile 已使用 session-core 的 `startListeningSession`、`acceptTranscriptTurn`、`requestCoachReply`、`receiveCoachReply`、`completeCoachPlayback`、`recoverSessionError`、`continueListening`、`endActiveSession` 和 playback queue helpers。
- Web `VoiceSessionProvider` 已使用 session-core 的 transcript、coach reply、playback completion、route pause 和 error recovery helpers；仍保留浏览器 STT、Web Audio、TTS playback、local/session storage 和 pending async cancellation。
- 后续 SHOULD 只在出现新的跨端业务规则时继续扩展 `session-core`；不要为了抽象而把具体平台 adapter 放入 `session-core`。
- 语音 endpointing 规则属于跨端业务规则，SHOULD 继续留在 `packages/session-core`；Web Audio、Browser Speech、Expo Speech、Expo Audio metering 仍留在各端 adapter。

## Phase E: Mobile 语音闭环产品化

目标：把 mobile 从 native probe 推进到可持续迭代的 native voice app。

### Next Three PRs

PR 1: Low-latency turn rules and mixed-language coaching.

- Scope:
  - Web silence finalize target SHOULD be 1.3-1.5 seconds for normal English utterances.
  - If the latest transcript ends with filler words such as `um`, `uh`, `er`, `hmm`, `嗯`, `啊`, or `呃`, the turn SHOULD get a short grace window instead of finalizing immediately.
  - English utterances that contain Chinese words MUST remain valid input, not be discarded as recognition noise.
  - The AI spoken reply MUST briefly explain the Chinese word or phrase in natural spoken English, not only put that explanation in corrections.
  - Corrections SHOULD still include a vocabulary item with the original Chinese text and a concise English replacement.
- Out of scope:
  - Native mobile speech recognition.
  - TTS streaming or sentence-pipeline playback.
  - Phase F voice profile work.
- Validation:
  - session-core tests cover normal silence timeout, filler grace, and mixed Chinese detection.
  - Web lint/build and package tests pass.

PR 2: Mobile native speech adapter.

- Scope:
  - Use a maintained React Native native speech library first, wrapped behind `apps/mobile/src/nativeSpeech.ts`.
  - Business UI MUST depend on the MeteorVoice adapter, not directly on the third-party library.
  - Adapter API SHOULD cover availability, permission request, start, stop, cancel, partial transcript, final transcript, and error state.
  - Mobile session flow becomes native STT transcript -> `/api/chat` -> `/api/tts` -> native playback.
  - Text input remains as fallback.
- Out of scope:
  - Custom Expo native module unless the library is blocked.
  - Backend STT streaming infrastructure.
  - Phase F voice profiles.
- Validation:
  - Mobile typecheck passes.
  - iOS development build can complete one spoken turn on a real device or simulator where native speech is available.

PR 3: TTS sentence pipeline.

- Scope:
  - Keep AI spoken replies short.
  - Split assistant reply into playable sentence segments through `packages/shared/src/speech.ts`.
  - Web SHOULD synthesize/play the first segment before requesting later segments as one long audio file, so audible feedback starts earlier for multi-sentence replies.
  - Mobile SHOULD synthesize the first segment first, enqueue later segment audio URLs, and advance the queue only after native playback reports completion.
  - Preserve one-speaker-at-a-time playback; no overlapping TTS.
  - Keep existing full-response TTS as fallback when segmentation fails.
  - CI SHOULD run on pull requests and pushes to `main` with lint, mobile typecheck/config, test, and web build.
- Out of scope:
  - True streaming TTS over server audio chunks.
  - New paid provider infrastructure.
  - Phase F voice profiles.
- Validation:
  - `splitSpokenText` tests cover English and Chinese punctuation plus max segment merging.
  - Playback starts earlier for multi-sentence replies in local/manual testing.
  - Existing Web and Mobile session behavior remains compatible.
  - GitHub Actions checks pass before merge.

优先补齐：

- Native speech input route：
  - 方案 1：录音上传到 server STT。
  - 方案 2：使用 iOS/Android native speech recognition。
  - 方案 3：两者并存，按设备能力和网络选择。
- Audio session hardening：
  - iOS interruption、route change、静音键、蓝牙耳机、前后台切换。
  - Android audio focus、权限、前后台录音限制。
- Session UX：
  - start/continue/end、current subtitles、Corrections/Transcript、summary、history/review 与 Web 行为一致。
  - Mobile 首屏 SHOULD 优先展示当前 voice stage、最新用户字幕、最新 coach 字幕和输入动作；API URL、auth、history、settings 属于次级区域。
- Preferences sync：
  - locale、scenario、accent、TTS provider、speed 在 Web/Mobile 间一致。

验收：

- iOS simulator 能跑基础 UI 和 mock/provider API。
- iOS 真机 development build 能完成一轮：用户语音输入 -> AI reply -> native playback -> correction -> session sync。
- Android 至少完成 emulator 或真机基础 smoke。
- `docs/mobile-audio-qa-checklist.md` 有真实执行记录或明确未执行项。

当前状态：

- Native speech adapter、native audio playback、TTS sentence playback queue 和正式练习页布局已合入。
- 尚缺至少一次 iOS 真机 development build 和一次 Android emulator/device 的人工 QA 记录。

## Phase F: 口音与语音能力专项

目标：把“支持不同英语口音”从 provider mapping 升级为可产品化能力。

短期策略：

- 继续使用 TTS provider 作为主路径。
- `packages/shared/src/speech.ts` MUST 维护 provider/accent capability matrix。
- UI MUST 禁用 provider 不支持的 accent，或显示明确原因。

中期策略：

- 抽象 `VoiceProfile`，不要只用 `accent` 字符串：
  - `accentKey`
  - `locale`
  - `gender/style`
  - `provider`
  - `voiceId`
  - `sampleUrl`
  - `supportedSpeeds`
  - `qualityTier`
- 为每个 provider 做 voice catalog sync 或手动 catalog。
- 允许同一 accent 下多个 voice，例如 American coach、British interview、Australian casual。

长期研究：

- 自建 TTS 或 voice conversion MAY 作为专项探索，但不应阻塞当前产品化。
- 自建方案必须单独评估数据授权、模型质量、推理成本、延迟、端侧体积、合规和可维护性。

验收：

- 用户选择的是可理解的 voice profile，而不是 provider 内部 voice id。
- API 和 Mobile 都能知道某个 accent/voice 当前是否可用。
- Provider fallback 不会悄悄改变用户选择的口音。

## AI Agent 执行要求

- 开始任何后续架构任务前，MUST 先确认当前分支、`git status` 和用户是否要求 issue/PR。
- 如果任务涉及代码，SHOULD 从本文档选一个 Phase 创建独立 issue/PR。
- 如果任务只整理文档，MUST 不改业务代码。
- 如果发现旧文档与本文档冲突，MUST 以本文档、`docs/project-structure.md` 和 `docs/development-rules.md` 为准。
