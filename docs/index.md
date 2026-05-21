# MeteorVoice 文档入口

本目录保存 MeteorVoice 的产品、工程、协作和交付资料。新开发者或 AI agent 开始工作前，MUST 先读本文件，再按任务类型读取对应计划和规则。

## 快速阅读顺序

1. `docs/development-rules.md`
   - 项目协作规则、issue/PR 规则、worktree/main 同步规则、测试要求、禁止项。
2. `docs/session-immersive-ui-plan.md`
   - 会话页沉浸式语音 UI 的产品/工程执行计划。
3. `docs/mobile-session-stage-and-ios-audio-plan.md`
   - 移动端全屏语音舞台改版和 iOS 音频播放可靠性方案。
4. `docs/spec.md`
   - 产品目标、MVP 范围、核心数据模型、AI 应用分层。
5. `docs/project-structure.md`
   - 当前单仓库内的前后端式分层约定。
6. `docs/tts-integration.md`
   - TTS provider、环境变量、口音能力映射和验证方式。

## 现有计划索引

- `docs/plan.md`: MVP 总体实施计划。
- `docs/product-optimization-plan.md`: 产品体验优化计划，包含 Corrections 面板、身份展示、本地化和可靠性。
- `docs/persistent-session-localization-plan.md`: 持久语音会话、本地化、路由切换暂停/恢复、TTS 速度控制计划。
- `docs/session-immersive-ui-plan.md`: 当前会话页沉浸式语音 UI 的执行入口。
- `docs/mobile-session-stage-and-ios-audio-plan.md`: 移动端会话舞台重构和 iOS 音频播放可靠性方案。

## 当前执行状态

- 会话页沉浸式语音 UI 当前即将进入 `dev/feature/session-immersive-experience` 集成开发。
- 本次集成目标 MUST 限定为 Phase 1 + Phase 4 基础版：状态驱动 waveform、当前字幕、`Corrections` / `Transcript` tabs、多语言文案、桌面/移动布局。
- 本次集成 MUST 不接入真实麦克风频谱，MUST 不接入真实 AI 播放音频频谱，MUST 不改 STT/TTS turn loop。
- Phase 2/3 的真实音频频谱能力 SHOULD 作为后续增强独立评估和开发，不属于本次代码范围，也不作为本次验收阻塞项。
- `dev/feature/audio-driven-session-waveforms` 用于后续增强 #52：在不改变 STT/TTS turn loop 的前提下，为 listening/speaking waveform 接入真实音频音量采样，并保留状态驱动 fallback。
- `docs/session-immersive-ui-plan.md` 已定义 Phase 1-4 的范围、禁止项、agent 分工和本次集成验收标准。
- 文档体系最终整理 SHOULD 在代码阶段完成后再做一次，以记录已完成范围、未完成风险和后续规则。

## 历史交接资料

以下文件是历史阶段资料，SHOULD 作为背景阅读，不应作为当前最高优先级规则：

- `docs/implementation-handoff.md`
- `docs/implementation-handoff-phase-2.md`
- `docs/implementation-handoff-phase-3.md`
- `docs/implementation-handoff-phase-4.md`
- `docs/one-shot-prompt.md`
- `docs/chronicle/2026-05-18.md`

如历史资料与 `docs/development-rules.md` 或 `docs/session-immersive-ui-plan.md` 冲突，MUST 以后两者为准，除非产品负责人明确改写规则。

## 文档维护规则

- 新增产品/工程计划时，MUST 在本入口补充链接和阅读顺序。
- 历史资料 MUST 保留，不应删除；过期内容 SHOULD 在新文档中标注替代入口。
- 面向 AI 执行的规则 SHOULD 使用 `MUST`、`SHOULD`、`MAY`、`禁止`、`验收` 等明确词。
- 文档默认使用中文；provider 名称、API 名称、路径、命令和技术术语 MAY 保留英文。
