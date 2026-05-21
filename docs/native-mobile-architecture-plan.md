# Native Mobile Architecture Plan

本文档定义 MeteorVoice 从单一 Web 应用升级为 Web + Native Mobile 双端架构的落地方案。后续 AI agent 在处理 mobile、React Native、Expo、共享包、会话引擎或跨端 API 任务前，MUST 先读本文件。

## 目标

- 将移动端语音练习做成一等 native client，而不是 WebView 壳或移动 Web 补丁。
- 保留现有 Next.js Web/API 投资，避免重写全部业务。
- 用一个 mobile 架构探针先验证业务架构是否合格，再扩大到完整 App。
- 把可共享的业务契约沉淀到 `packages/*`，让 Web 和 Mobile 消费同一套类型、配置和 API client。
- 让会话状态机逐步从 Web React provider 中抽离，形成平台无关的 session core。
- 一口气完成 native mobile 的业务闭环：登录、场景选择、完整语音会话、纠错、历史、复习、设置和本地编译运行说明。

## 非目标

- 本阶段不追求 TestFlight、App Store、Android 上架或团队分发。
- 本阶段不把现有 Next.js 项目一次性迁移到 `apps/web`。
- 本阶段不做 WebView 壳 App。
- 本阶段不复制一套 mobile-only prompt、scenario、accent 或 correction 数据模型。
- 本阶段不为了 monorepo 外观大规模搬迁无关代码。
- 本阶段不保证所有 App Store 级边缘场景已经打磨完成，但 MUST 留下可继续硬化的 native app 结构和 QA runbook。

## 目标架构

```text
MeteorVoice/
  apps/
    web/                       # Next.js Web app，架构升级后期迁入
    mobile/                    # Expo React Native native client
  packages/
    shared/                    # 跨端类型、scenario、accent、i18n key、基础校验
    api-client/                # typed API client，Web/Mobile 共用
    session-core/              # 平台无关会话状态机和 turn lifecycle
    server/                    # 可选：后期承载 Web API/server-only orchestration
```

短期允许 `app/`、`components/`、`lib/` 继续留在仓库根目录。完整架构升级后期 MUST 将 Web 迁入 `apps/web`，但迁移必须在 mobile 业务闭环和 shared/session-core 边界稳定后单独执行，不能混入 session-core 或 native audio PR。

## 分层规则

### Web/API 层

- 迁移前 `app/api/*` 继续作为现有 API 入口；迁移后 `apps/web/app/api/*` 成为 API 入口。
- API route SHOULD 调用 `lib/server/*` 或 provider/service helper，不应内联复杂业务。
- Web UI MAY 继续使用 `components/VoiceSessionProvider.tsx`，但新增共享逻辑 SHOULD 优先进入 `packages/session-core`。
- Secrets MUST 只存在 server-side 环境变量，禁止进入 mobile bundle。
- Web 迁入 `apps/web` 时，Web-only UI、Next config、global CSS、public assets 和 route handlers MUST 一起迁移，禁止把 Web app 拆成半根目录半 `apps/web` 的状态长期保留。

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

本路线图目标是完成完整 native mobile 架构升级，不只停在 foundation v1。PR 1-6 建立架构基础；PR 7-14 补齐移动端业务闭环和本地运行可验证性。

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

### PR 7: Mobile Auth and API Session

范围：

- 为 Mobile 增加登录入口。
- 优先复用现有 Supabase auth 能力；如果当前 Web auth 不适合 mobile，先补 API/session 契约。
- API client 支持 auth token/session header 注入。
- Mobile 持久保存必要的 auth session，禁止保存 server secrets。

验收：

- Mobile 可以登录、退出并在 app reload 后恢复登录态。
- Mobile 调用需要身份的 history/session API 时不依赖 Web cookie/localStorage。
- Web auth 不回退。

### PR 8: Mobile Scenario and Accent Selection

范围：

- Mobile 增加 scenario/accent 选择页面或轻量入口。
- 使用 `packages/shared` 的 scenario/accent 配置。
- 支持默认场景、默认口音和用户偏好读取。
- 选择结果传入 session core 和 API context。

验收：

- Mobile 可选择场景和口音后进入 session。
- Web 和 Mobile 对同一个 scenario/accent key 的显示一致。
- 不复制第二套 scenario/accent 数据。

### PR 9: Mobile Full Voice Session UX

范围：

- 将 mobile probe 升级为完整 session screen。
- 使用 `packages/session-core` 驱动状态和 turn lifecycle。
- 实现 listening、transcribing、thinking、speaking、paused、ended 的移动端状态视图。
- 展示当前用户字幕、AI 字幕、Corrections 和 Transcript。
- 支持 start/end/continue、summary、route/app pause/resume。

验收：

- 一轮真实用户输入只触发一次 AI 回复。
- TTS 播放期间不录音。
- Corrections 不阻塞下一轮。
- App 前后台切换有明确暂停/恢复状态。

### PR 10: Mobile History and Review

范围：

- Mobile 增加历史列表和 session detail/review 页面。
- 复用 `packages/api-client` 的 history/review API；缺口先补 API 契约。
- 展示 session summary、turns、corrections。
- 支持从历史进入复习视图。

验收：

- Mobile 能看到与 Web 一致的历史记录。
- correction item 字段不暴露内部数据库列名。
- 空状态、加载态、错误态可读。

### PR 11: Mobile Settings and Preferences

范围：

- Mobile 增加设置页面。
- 支持 interface language、TTS provider、TTS speed、默认 scenario/accent。
- 偏好通过 API sync，必要时有本地 fallback。
- 保持 Web 设置不回退。

验收：

- Mobile 设置更新后后续 session 生效。
- Web/Mobile 对 TTS provider 和 speed 的语义一致。
- Provider 未配置时有可理解错误或 fallback。

### PR 12: Native Audio Hardening

范围：

- 加固 iOS/Android native audio 行为。
- 明确麦克风权限 denied/restricted、录音中断、播放中断、蓝牙/听筒/扬声器路由、静音开关和系统音量提示。
- 处理 app background/foreground、音频焦点、重复点击和并发播放。
- 增加 native audio adapter 测试或手动 QA checklist。

验收：

- iOS 真机可完成连续多轮语音会话。
- 权限拒绝不会卡死 session。
- TTS 播放失败不静默进入下一轮 listening。
- 同一时刻不会同时录音和播放 AI 音频。

### PR 13: Mobile Local Build Runbook

范围：

- 增加 `docs/mobile-local-build-runbook.md`。
- 记录不依赖 TestFlight 的本地编译方式：
  - Expo Go 适用范围。
  - `npx expo prebuild`。
  - `npx expo run:ios`。
  - 免费 Apple ID 真机调试限制。
  - 国内网络下避开 EAS/tunnel 的建议。
- 记录 `.env`、API base URL、Xcode、simulator、真机调试步骤。

验收：

- 产品负责人能按文档在本机尝试编译/运行 mobile app。
- 文档明确哪些能力 Expo Go 不能验证。
- 文档不包含真实 secrets。

### PR 14: Native Mobile Completion Pass

范围：

- 汇总 PR 1-13 后的剩余差异。
- 整理 docs 当前状态。
- 补齐关键 lint/test/build 脚本。
- 从 `dev/architecture/native-mobile` 向 `main` 提交完整架构升级 PR。
- 暂不合入 `release`，除非产品负责人明确确认。

验收：

- `main` 包含完整 Web + Native Mobile 双端架构。
- Web 现有功能通过回归验证。
- Mobile 具备登录、选择、会话、纠错、历史/复习、设置和本地运行说明。
- 所有后续未完成事项以 issue 或 docs TODO 明确记录，不靠聊天上下文记忆。

### PR 15: Move Web App to apps/web

范围：

- 将当前根目录 Web app 迁移到 `apps/web`：
  - `app/` -> `apps/web/app/`
  - `components/` -> `apps/web/components/`
  - Web-only `lib/` -> `apps/web/lib/` 或更明确的 `packages/server` / `packages/shared`
  - `public/`、`app/globals.css`、Next config、PostCSS/Tailwind 配置按实际归属迁移。
- 根目录保留 workspace 管理文件：
  - `package.json`
  - `package-lock.json`
  - `tsconfig.base.json` 或共享 TS config
  - `docs/`
  - `packages/`
  - `apps/`
- 为 `apps/web` 增加自己的 `package.json` scripts：
  - `dev`
  - `build`
  - `start`
  - `lint` 如需要。
- 根目录 scripts 改为 workspace 调用，例如：
  - `npm --workspace @meteorvoice/web run build`
  - `npm --workspace @meteorvoice/web run dev`
  - `npm --workspace @meteorvoice/mobile run ios`
- 修正 TS path、Next aliases、Vitest aliases 和 imports。
- 更新 Vercel 部署说明和项目设置要求。

禁止：

- 不在此 PR 同时重写 Web UI 或 session 行为。
- 不把 mobile 代码移动到 Web app 内。
- 不把 server secrets 暴露到 `packages/shared` 或 mobile bundle。

验收：

- 根目录 `npm install` 可完成 workspace install。
- 根目录 `npm test` 或新的等价命令能完成 Web tests + Web build。
- `cd apps/web && npm run build` 通过。
- Web imports 不再依赖根目录 `app/`、`components/` 位置。
- Mobile app 仍能 import `packages/shared`、`packages/api-client`、`packages/session-core`。
- Vercel Root Directory 可改为 `apps/web`，并记录在 docs 中。

### PR 16: Deployment and Workspace Finalization

范围：

- 更新 Vercel 配置文档：
  - Root Directory: `apps/web`
  - Production Branch: `release`
  - Install Command / Build Command 的最终值
  - 环境变量迁移检查清单
- 增加 `docs/deployment-runbook.md` 或更新现有部署文档。
- 调整 GitHub ruleset/branch 流程说明，明确 `main`、`release`、`dev/architecture/native-mobile` 在迁移后的职责。
- 从 `dev/architecture/native-mobile` 向 `main` 提最终架构升级 PR。
- 暂不自动合入 `release`，除非产品负责人确认 Web 和 Mobile 本地验证完成。

验收：

- `main` 可以作为完整 monorepo 集成主线。
- Vercel 能从 `apps/web` 构建 Web。
- `release` 仍作为稳定发布/预发布分支。
- 文档中不再把根目录描述为长期 Next.js app 根路径。

## 本地运行策略

本阶段不依赖 TestFlight。

推荐顺序：

1. Expo Go 可用于快速看 UI 和 API 调试。
2. iOS simulator 用于 development build 快速验证。
3. 真机 development build 用于验证真实麦克风、扬声器、蓝牙、静音开关和系统音量。
4. EAS Build 只在需要远程云构建或团队分发时再引入。

国内网络下 SHOULD 优先使用本地 Xcode/development build，减少对 EAS 云构建和 tunnel 的依赖。

## 完成定义

Native Mobile 架构升级完成时 MUST 满足：

- `main` 中存在可维护的 monorepo 结构：`apps/mobile`、`packages/shared`、`packages/api-client`、`packages/session-core`。
- Web app 已迁入 `apps/web`，根目录只保留 workspace、docs、packages 和配置入口。
- Web 和 Mobile 共享 scenario/accent、conversation/correction DTO、API client 和核心 session lifecycle。
- Mobile 不依赖 WebView、不 import Web UI、不读取 Web browser storage。
- Mobile 具备完整业务闭环：登录 -> 选择场景/口音 -> 语音会话 -> AI 语音回复 -> corrections -> summary/history/review -> settings。
- Native audio adapter 能处理基础录音、播放、权限拒绝、播放失败和 app pause/resume。
- 本地编译/运行 runbook 可供产品负责人按步骤尝试。
- Vercel deployment runbook 已记录 `apps/web` Root Directory 迁移和发布流程。
- 架构升级合入 `main` 后，`release` 是否跟进由产品负责人单独确认。

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
- PR 5 `Extract Session Core` 已在阶段分支实现：新增 `packages/session-core`，抽出 workflow 和 turn guard helpers。
- PR 6 `Native Audio Integration` 已在阶段分支实现：Mobile probe 通过 `useNativeSessionAudio` 封装 native playback/recording adapter，配置 `expo-audio` 权限插件，覆盖录音权限、录音保存、TTS replay、前后台暂停和播放时禁止录音的基础约束。
- PR 7 `Mobile Auth and API Session` 已在阶段分支实现：`packages/api-client` 支持动态 auth headers 和 `/api/session` 创建/更新方法；server Supabase client 支持 mobile bearer token；Mobile probe 增加 Supabase email/password 登录、SecureStore session 持久化和创建 API session 的验证入口。
- PR 8 `Mobile Scenario and Accent Selection` 已在阶段分支实现：Mobile probe 使用 `packages/shared` 的 scenario/accent 配置渲染可选入口，选择结果进入 chat context 和 TTS accent，切换场景会清空当前探针对话状态。
- PR 9 `Mobile Full Voice Session UX` 已在阶段分支实现：Mobile probe 消费 `packages/session-core` workflow snapshot，增加 start/end/continue、当前字幕、Corrections/Transcript tabs、summary 和 session sync，并保留 native audio adapter 与文本 turn probe。
- PR 10 `Mobile History and Review` 已在阶段分支实现：Mobile probe 通过 `packages/api-client` 读取 `/api/history`，增加历史列表、选中 session review、summary/empty/error/loading 状态。
- PR 11 `Mobile Settings and Preferences` 已在阶段分支实现：Mobile probe 增加 settings 面板，读取/保存 TTS provider，维护本地 TTS speed 和默认 scenario/accent 展示，后续 TTS 请求使用当前 provider/speed。
- PR 12 `Native Audio Hardening` 已在阶段分支实现：native audio adapter 增加互斥操作保护、前后台录音停止/播放暂停处理，并新增 `docs/mobile-audio-qa-checklist.md` 记录真机/模拟器音频 QA 项。
- PR 13 `Mobile Local Build Runbook` 已在阶段分支实现：新增 `docs/mobile-local-build-runbook.md`，记录 Expo Go、`expo prebuild`、`expo run:ios`、免费 Apple ID 真机调试、环境变量和国内网络建议。
- PR 14 `Native Mobile Completion Pass` 已在阶段分支实现：新增根目录 mobile workspace scripts 和 `docs/native-mobile-completion-status.md`，汇总 PR1-PR14 能力、验证命令、已知限制和剩余 PR15/PR16。
- 下一步 SHOULD 执行 PR 15：`Move Web App to apps/web`。
- 完整 native mobile 架构升级目标扩展到 PR 16，包含 `apps/web` 迁移和 Vercel/workspace 收尾，不能停在 foundation v1。
