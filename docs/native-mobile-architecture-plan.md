# Native Mobile Architecture Plan

本文档定义 MeteorVoice 从单一 Web 应用升级为 Web + Native Mobile 双端架构的落地方案。后续 AI agent 在处理 mobile、React Native、Expo、共享包、会话引擎或跨端 API 任务前，MUST 先读本文件。

## 目标

- 将移动端语音练习做成一等 native client，而不是 WebView 壳或移动 Web 补丁。
- 保留现有 Next.js Web/API 投资，避免重写全部业务。
- 用一个 mobile 架构探针先验证业务架构是否合格，再扩大到完整 App。
- 把可共享的业务契约沉淀到 `packages/*`，让 Web 和 Mobile 消费同一套类型、配置和 API client。
- 让会话状态机逐步从 Web React provider 中抽离，形成平台无关的 session core。

## 非目标

- 本阶段不追求 TestFlight、App Store、Android 上架或团队分发。
- 本阶段不把现有 Next.js 项目一次性迁移到 `apps/web`。
- 本阶段不做 WebView 壳 App。
- 本阶段不复制一套 mobile-only prompt、scenario、accent 或 correction 数据模型。
- 本阶段不为了 monorepo 外观大规模搬迁无关代码。

## 目标架构

```text
MeteorVoice/
  app/                         # 现有 Next.js App Router，短期保留
  components/                  # 现有 Web UI，短期保留
  lib/                         # 现有 Web/API/server/provider 代码，逐步抽共享层
  apps/
    mobile/                    # Expo React Native native client
  packages/
    shared/                    # 跨端类型、scenario、accent、i18n key、基础校验
    api-client/                # typed API client，Web/Mobile 共用
    session-core/              # 平台无关会话状态机和 turn lifecycle
```

短期允许 `app/`、`components/`、`lib/` 继续留在仓库根目录。只有当 mobile 探针证明共享边界稳定后，才 MAY 将 Web 迁入 `apps/web`。

## 分层规则

### Web/API 层

- `app/api/*` 继续作为现有 API 入口。
- API route SHOULD 调用 `lib/server/*` 或 provider/service helper，不应内联复杂业务。
- Web UI MAY 继续使用 `components/VoiceSessionProvider.tsx`，但新增共享逻辑 SHOULD 优先进入 `packages/session-core`。
- Secrets MUST 只存在 server-side 环境变量，禁止进入 mobile bundle。

### Mobile 层

- `apps/mobile` MUST 是独立 Expo React Native App。
- Mobile MUST 调用公开 API 或 `packages/api-client`，禁止 import Web component、Next route handler、server-only provider。
- Mobile MUST 使用 native audio/recording 能力，不做 WebView 包壳。
- Mobile 本地状态 MAY 使用 React state/Zustand 等轻量方案；会话规则 SHOULD 来自 `packages/session-core`。

### Shared 层

- `packages/shared` SHOULD 放：
  - `ConversationMessage`
  - `ConversationResponse`
  - `CorrectionItem`
  - `Scenario`
  - `AccentProfile`
  - `UserPreference`
  - scenario/accent 配置
  - 跨端 i18n key 或基础字典
- `packages/api-client` SHOULD 放：
  - `/api/preferences`
  - `/api/chat`
  - `/api/tts`
  - `/api/summary`
  - `/api/session/sync`
  - `/api/history` 或后续历史 API
- `packages/session-core` SHOULD 放：
  - session state enum
  - turn guard
  - transition reducer
  - next action calculation
  - platform adapter interface

## Mobile 架构探针

Mobile Phase 0 的目的不是证明 iOS 能不能播放声音，而是证明 MeteorVoice 的业务架构能否支撑独立 native client。

### 探针范围

`apps/mobile` SHOULD 实现一个最小闭环：

1. 读取 API base URL 配置。
2. 获取或使用共享 scenario/accent 配置。
3. 进入一个 session screen。
4. 支持输入一段用户文本，或在后续接入 native 录音/STT。
5. 调用 `/api/chat` 获取 AI reply 和 corrections。
6. 调用 `/api/tts` 获取 `audioUrl`。
7. 使用 native/RN 播放能力播放回复。
8. 展示当前用户字幕、AI 字幕和 corrections。
9. 可调用 session sync 或至少形成与 Web 一致的 session/turn DTO。

### 探针验收

- Mobile 不 import `app/*`、`components/*`、Next-only module 或 server-only provider。
- Mobile 不依赖 browser `localStorage`、`sessionStorage`、`window`、DOM、Web Audio 或 Web Speech API。
- Mobile 使用 `packages/shared` 类型和配置。
- Mobile 使用 `packages/api-client` 调用后端。
- 一轮 turn 只通过公开 API 完成。
- AI reply、corrections、scenario、accent 的数据结构与 Web 一致。
- 能在 iOS simulator 或本机真机 development build 跑起来。

## API 契约要求

Mobile client 需要稳定 API，而不是页面内部状态。后续 API 调整 MUST 以 DTO 形式明确输入输出。

### 必需 API

- `GET /api/preferences`
  - 返回 user locale、TTS provider、TTS speed、默认 scenario/accent 等。
- `POST /api/chat`
  - 输入 recent messages 和 context。
  - 输出 `ConversationResponse`。
- `POST /api/tts`
  - 输入 text、accent、provider、speed。
  - 输出可播放 `audioUrl` 或明确错误。
- `POST /api/session/sync`
  - 输入 session summary、turns、messages、corrections。
  - 输出 sync status。
- `POST /api/summary`
  - 输入 session messages/context。
  - 输出 summary。

### 后续 SHOULD 补齐

- `GET /api/scenarios`
- `GET /api/accents`
- `GET /api/history`
- `GET /api/review`
- token-based auth 或移动端可用的 Supabase auth flow。

## Session Core 目标

现有 Web 会话规则集中在 `components/VoiceSessionProvider.tsx`。Mobile 探针后 SHOULD 逐步抽出平台无关核心。

目标接口示意：

```ts
type SessionPlatformAdapter = {
  listen(): Promise<{ transcript: string }>
  speak(input: { text: string; accent: string; speed: number }): Promise<void>
  stopListening(): void
  stopSpeaking(): void
}

type SessionCoreEvent =
  | { type: 'START' }
  | { type: 'USER_TRANSCRIPT'; transcript: string }
  | { type: 'AI_REPLY'; response: ConversationResponse }
  | { type: 'PLAYBACK_ENDED' }
  | { type: 'PAUSE' }
  | { type: 'END' }
```

规则：

- 每个真实用户 utterance MUST 最多触发一个 AI reply。
- TTS 播放期间 MUST 不进入 listening。
- TTS 结束后才能释放 turn lock。
- route pause、app background、permission denied、playback failure MUST 显式进入可恢复状态。
- Web adapter 负责 browser STT/TTS/audio unlock；Mobile adapter 负责 native recording/playback。

## 长期分支策略

Native Mobile 架构升级 SHOULD 使用长期集成分支：

```text
dev/architecture/native-mobile
```

规则：

- `dev/architecture/native-mobile` 作为双端架构升级的长期留存分支。
- 每个阶段 SHOULD 从 `dev/architecture/native-mobile` 切短分支，例如：
  - `dev/feature/shared-package-skeleton`
  - `dev/feature/mobile-api-client`
  - `dev/feature/expo-mobile-probe`
  - `dev/feature/session-core`
- 阶段 PR SHOULD 先合回 `dev/architecture/native-mobile`，不要默认直接进 `main`。
- 当一个可运行里程碑完成后，再从 `dev/architecture/native-mobile` 向 `main` 提集成 PR。
- 长期分支需要定期从 `main` 非破坏性同步，优先使用 merge 或 rebase，禁止 `reset --hard` 覆盖他人改动。
- 所有阶段 PR body MUST 写明 base branch 是 `dev/architecture/native-mobile` 还是 `main`。
- 如果用户明确要求某个小修直接进 `main`，该修复 SHOULD 独立分支处理，不要混入长期架构分支。

## 推荐实施切分

### PR 1: Document Native Mobile Architecture

范围：

- 新增本文件。
- 更新 `docs/index.md` 和 `docs/project-structure.md`。
- 不改业务代码。

验收：

- 后续 AI 能从 docs 入口找到双端架构计划。
- 文档明确 mobile 探针目标、非目标、验收和 PR 切分。

### PR 2: Add Shared Package Skeleton

范围：

- 新增 `packages/shared`。
- 抽出或重新导出跨端类型。
- 优先迁移不依赖 React/Next/browser 的 scenario、accent 和 provider response types。
- 设置 TypeScript path 或 package exports。

禁止：

- 不迁移 Web UI。
- 不改 provider runtime 行为。

验收：

- Web build 通过。
- Web 仍能读取 scenario/accent。
- `packages/shared` 不引用 Next、React DOM、server-only env。

### PR 3: Add API Client Package

范围：

- 新增 `packages/api-client`。
- 封装 typed fetch client。
- 支持传入 `baseUrl`，不绑定浏览器 origin。
- Web 可选择先不切换，Mobile 探针必须使用它。

验收：

- API client 可在 Node/RN/browser 环境构造。
- 请求/响应类型来自 `packages/shared`。
- 错误返回有统一结构或最小可读错误。

### PR 4: Add Expo Mobile Probe

范围：

- 新增 `apps/mobile`。
- 使用 Expo React Native。
- 配置本地 development 运行脚本。
- 实现一个 session probe screen。
- 调用 `packages/api-client` 完成文本输入 -> AI reply -> TTS playback -> corrections 展示。

禁止：

- 不做 WebView。
- 不复制 Web session provider。
- 不引入完整 App 导航复杂度。

验收：

- `cd apps/mobile && npm run ios` 或等价命令可运行到 simulator。
- Mobile 不 import Web-only 文件。
- 使用真实 API 完成一轮会话。

### PR 5: Extract Session Core

范围：

- 新增 `packages/session-core`。
- 抽平台无关 state machine、turn guard、transition。
- Web provider 改为消费 session core 的 reducer/规则。
- Mobile probe 改为消费同一套 session core。

验收：

- Web session 行为不回退。
- Mobile session 行为与 Web turn lifecycle 一致。
- 新增或更新测试覆盖 transition 和重复 turn guard。

### PR 6: Native Audio Integration

范围：

- Mobile 使用 native playback/recording adapter。
- iOS 配置 `Info.plist` 麦克风权限文案。
- 根据所选库配置 audio session 或播放模式。
- 接入 STT 路径：可先上传录音到现有 STT API，或后续接 native speech recognition。

验收：

- 真机或 simulator 能播放 TTS reply。
- 录音权限、拒绝权限、app background/foreground 有明确状态。
- TTS 播放期间不录音。

## 本地运行策略

本阶段不依赖 TestFlight。

推荐顺序：

1. Expo Go 可用于快速看 UI 和 API 调试。
2. iOS simulator 用于 development build 快速验证。
3. 真机 development build 用于验证真实麦克风、扬声器、蓝牙、静音开关和系统音量。
4. EAS Build 只在需要远程云构建或团队分发时再引入。

国内网络下 SHOULD 优先使用本地 Xcode/development build，减少对 EAS 云构建和 tunnel 的依赖。

## AI Agent 执行规则

- 开始 mobile 相关任务前 MUST 先同步 `main` 并切任务分支。
- MUST 先读 `docs/index.md`、`docs/development-rules.md` 和本文件。
- 每个 PR 只能做一个阶段，除非用户明确要求合并阶段。
- 新增包时 MUST 保持 package boundary 清楚，禁止通过相对路径跨层 import Web 文件。
- 每个阶段完成后 MUST 更新本文件的实施状态或在 PR body 中说明未更新原因。
- 如果发现现有 API 不适合 Mobile，SHOULD 先补 API 契约或 DTO，不要在 Mobile 内写 workaround。
- 如果文档与代码现实冲突，MUST 在 PR 中明确指出，并优先修本文档或新建 follow-up issue。

## 当前实施状态

- Web 会话页沉浸式 UI 已完成。
- Mobile Web 的 iOS audio unlock/fallback 已完成，但不能作为 native mobile 的长期架构替代。
- Native Mobile 架构已开始。
- PR 2 `Add Shared Package Skeleton` 已在阶段分支实现：新增 `packages/shared`，抽出跨端 locale、scenario、accent、conversation 和 speech DTO。
- PR 3 `Add API Client Package` 已在阶段分支实现：新增 `packages/api-client`，提供可传 `baseUrl` 的 typed fetch client。
- PR 4 `Add Expo Mobile Probe` 已在阶段分支实现：新增 `apps/mobile`，提供可运行的 Expo session probe。
- 下一步 SHOULD 执行 PR 5：`Extract Session Core`。
