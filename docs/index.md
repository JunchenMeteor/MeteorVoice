# MeteorVoice 文档入口

本目录保存 MeteorVoice 的产品、工程、协作和交付资料。新开发者或 AI agent 开始工作前，MUST 先读本文件，再按任务类型读取对应计划和规则。

## 当前必读

1. `docs/development-rules.md`
   - 仓库协作、分支、issue/PR、测试、语音会话和 TTS/STT 时序规则。
2. `docs/project-structure.md`
   - 当前 `apps/web`、`apps/mobile`、`packages/*` 的分层边界。
3. `docs/architecture-productization-roadmap.md`
   - 双端架构骨架完成后的产品化路线图，包含文档收口、workspace 工程化、API 契约、session-core、mobile 语音闭环和口音能力专项。
4. `docs/native-mobile-architecture-plan.md`
   - Web + Native Mobile 双端架构升级历史路线、mobile 探针、共享包和 session core 落地计划。
5. `docs/session-endpointing-vad.md`
   - 会话页“用户是否说完”的 endpointing + VAD 设计，修改 STT/VAD/静音等待/轮次触发前 MUST 阅读。

## 当前执行状态

- 当前主线：`main` 已完成 Web 迁入 `apps/web`、Expo native mobile app、`packages/shared`、`packages/api-client`、`packages/session-core` 的双端架构骨架。
- 当前稳定发布/预发布分支：`release`。
- 已完成并合入 `main`：沉浸式 UI、移动端 full-screen stage、waveform、AI 回复自然度优化、iOS Web audio unlock、CI 并行化、历史页详展/分页/软删除、Preferences 跨设备同步、Mobile 音频中断硬化。
- 当前正在推进三合一层级判停（`docs/semantic-endpointing-plan.md`），将固定静默等待升级为 L1 本地判断 + L2 LLM 语义判停 + L3 安全网超时。
- 2026-05-29 已完成一轮 Mobile bug review 和代码修复，记录见 `docs/mobile-bug-review-2026-05-29.md`；Bluetooth/headphone route 和真机前后台 QA 仍需执行。

## 活跃计划

- `docs/native-mobile-architecture-plan.md`
  - 双端架构升级历史路线。后续架构任务 SHOULD 优先读 `docs/architecture-productization-roadmap.md`，再回看本文件的设计背景。
- `docs/architecture-productization-roadmap.md`
  - 当前最高优先级路线图。定义架构骨架完成后的产品化阶段、AI 执行要求和验收标准。
- `docs/mobile-audio-qa-checklist.md`
  - Native audio 真机/模拟器 QA checklist，覆盖播放、录音、权限、前后台和设备路由。
- `docs/mobile-voice-stability-plan.md`
  - Mobile 语音稳定性执行规格，覆盖播放后恢复监听 bug、自回声门控、文本回声过滤、Expo AEC 边界和 native AEC 可行性。
- `docs/mobile-bug-review-2026-05-29.md`
  - 2026-05-29 Mobile 语音循环、前后台、TTS provider/voice sync、text fallback 和 QA 缺口审查记录。
- `docs/mobile-local-build-runbook.md`
  - Native mobile 本地运行和编译说明，覆盖 Expo Go、development build、真机调试和国内网络建议。
- `docs/native-mobile-completion-status.md`
  - Native mobile completion pass 状态、当前验证命令和已知限制。
- `docs/session-endpointing-vad.md`
  - Web/Mobile 语音 endpointing、VAD 信号、文本未完判断和后续 native VAD 增强计划。
- `docs/execution-plan-ci-history-prefs-audio.md`
  - 四个并行方向的详细执行计划：CI/CD 增强、历史页完善、跨设备偏好同步、Mobile 音频硬化。每个方向独立可操作，含实施步骤和验收标准。
- `docs/semantic-endpointing-plan.md`
  - 三合一层级判停方案：Layer 1 本地快速判断 + Layer 2 LLM 语义判停 + Layer 3 安全网超时。从固定静默时长升级为智能 end-of-turn 检测。
- `docs/voice-profile-unification-plan.md`
  - 后续统一教练声音选择计划，覆盖 Xunfei/Azure 等 provider 的 voice profile 模型和 UI 方向。
- `docs/deployment-runbook.md`
  - Monorepo 迁移后的 Vercel 部署、分支职责、环境变量和发布/回滚流程。

## 已完成计划

这些文档记录已经落地的 Web/mobile Web 阶段，作为回归规则和背景参考，不再作为下一阶段主执行入口：

- `docs/archive/plans/session-immersive-ui-plan.md`
  - 会话页沉浸式语音 UI、Corrections/Transcript tabs、当前字幕、P2/P3 waveform 计划。
- `docs/archive/plans/mobile-session-stage-and-ios-audio-plan.md`
  - 移动端全屏语音舞台、iOS Web audio unlock/fallback 计划。
- `docs/archive/plans/persistent-session-localization-plan.md`
  - 持久会话、本地化、TTS 速度、路由 pause/resume 计划。
- `docs/archive/plans/product-optimization-plan.md`
  - 产品体验优化计划，包含 corrections、身份展示、本地化和可靠性。

## 产品和集成参考

- `docs/spec.md`
  - 产品目标、MVP 范围、核心数据模型、AI 应用分层。
- `docs/plan.md`
  - MVP 总体实施计划和技术栈背景。
- `docs/tts-integration.md`
  - TTS provider、环境变量、口音能力映射和验证方式。
- `docs/supabase-setup.md`
  - Supabase 配置、RLS、用户名 + 手机登录模式。

## 归档资料

归档资料只作为历史记录。除非用户明确要求回溯历史阶段，否则后续 AI agent SHOULD 不把这些文档当作当前执行规则。

- `docs/archive/handoffs/`
  - 历史 phase handoff 文档。
- `docs/archive/plans/`
  - 已完成或过期的阶段计划。
- `docs/archive/prompts/one-shot-prompt.md`
  - 早期一次性开发提示词。
- `docs/chronicle/`
  - 历史实施记录。

如归档资料与 `docs/development-rules.md`、`docs/project-structure.md` 或 `docs/native-mobile-architecture-plan.md` 冲突，MUST 以后三者为准，除非产品负责人明确改写规则。

## 文档维护规则

- 新增产品/工程计划时，MUST 在本入口补充链接和阅读顺序。
- 历史资料 MUST 保留，不应直接删除；过期内容 SHOULD 移入 `docs/archive/` 或在新文档中标注替代入口。
- 面向 AI 执行的规则 SHOULD 使用 `MUST`、`SHOULD`、`MAY`、`禁止`、`验收` 等明确词。
- 文档默认使用中文；provider 名称、API 名称、路径、命令和技术术语 MAY 保留英文。
