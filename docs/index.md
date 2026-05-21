# MeteorVoice 文档入口

本目录保存 MeteorVoice 的产品、工程、协作和交付资料。新开发者或 AI agent 开始工作前，MUST 先读本文件，再按任务类型读取对应计划和规则。

## 快速阅读顺序

1. `docs/development-rules.md`
   - 项目协作规则、issue/PR 规则、worktree/main 同步规则、测试要求、禁止项。
2. `docs/native-mobile-architecture-plan.md`
   - Web + Native Mobile 双端架构升级、mobile 探针、共享包和 session core 落地计划。
3. `docs/session-immersive-ui-plan.md`
   - 会话页沉浸式语音 UI 的产品/工程执行计划。
4. `docs/mobile-session-stage-and-ios-audio-plan.md`
   - 移动端全屏语音舞台改版和 iOS 音频播放可靠性方案。
5. `docs/spec.md`
   - 产品目标、MVP 范围、核心数据模型、AI 应用分层。
6. `docs/project-structure.md`
   - 当前单仓库内的前后端式分层约定。
7. `docs/tts-integration.md`
   - TTS provider、环境变量、口音能力映射和验证方式。

## 现有计划索引

- `docs/plan.md`: MVP 总体实施计划。
- `docs/product-optimization-plan.md`: 产品体验优化计划，包含 Corrections 面板、身份展示、本地化和可靠性。
- `docs/persistent-session-localization-plan.md`: 持久语音会话、本地化、路由切换暂停/恢复、TTS 速度控制计划。
- `docs/session-immersive-ui-plan.md`: 当前会话页沉浸式语音 UI 的执行入口。
- `docs/mobile-session-stage-and-ios-audio-plan.md`: 移动端会话舞台重构和 iOS 音频播放可靠性方案。
- `docs/native-mobile-architecture-plan.md`: Web + Native Mobile 双端架构升级和 mobile 架构探针执行方案。

## 当前执行状态

- 会话页沉浸式语音 UI、移动端 full-screen stage、P2/P3 音频驱动 waveform、AI 回复长度/速度优化、iOS Web audio unlock/fallback 已完成并合入 `main`。
- iOS Web audio unlock 是移动 Web 的可靠性修复，不是 native mobile 长期架构替代。
- 下一阶段 SHOULD 以 `docs/native-mobile-architecture-plan.md` 为最高优先级计划，执行 Web + Native Mobile 双端架构升级。
- Native Mobile 第一阶段目标是 mobile 架构探针：验证 API 契约、共享类型、会话状态机边界和业务闭环，而不是证明原生音频能力本身。

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
