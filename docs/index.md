# MeteorVoice 文档入口

本目录保存 MeteorVoice 的产品、工程、协作和交付资料。新开发者或 AI agent 开始工作前，MUST 先读本文件，再按任务类型读取对应计划和规则。

## 当前必读

1. `docs/development-rules.md`
   - 仓库协作、分支、issue/PR、测试、语音会话和 TTS/STT 时序规则。
2. `docs/project-structure.md`
   - 当前根目录 Next.js 项目与未来 `apps/*`、`packages/*` 的分层边界。
3. `docs/native-mobile-architecture-plan.md`
   - Web + Native Mobile 双端架构升级、长期分支、mobile 探针、共享包和 session core 落地计划。

## 当前执行状态

- 当前长期架构分支：`dev/architecture/native-mobile`。
- 当前稳定发布/预发布分支：`release`。
- 会话页沉浸式 UI、移动端 full-screen stage、P2/P3 音频驱动 waveform、AI 回复长度/速度优化、iOS Web audio unlock/fallback 已完成并合入 `main`。
- iOS Web audio unlock 是移动 Web 的可靠性修复，不是 native mobile 长期架构替代。
- 下一阶段 SHOULD 从 `dev/architecture/native-mobile` 切阶段分支，按 `docs/native-mobile-architecture-plan.md` 执行 `packages/shared`、`packages/api-client`、`apps/mobile` 和 `packages/session-core`。

## 活跃计划

- `docs/native-mobile-architecture-plan.md`
  - 最高优先级计划。定义双端架构升级、mobile 架构探针、长期分支策略和阶段 PR。
- `docs/mobile-audio-qa-checklist.md`
  - Native audio 真机/模拟器 QA checklist，覆盖播放、录音、权限、前后台和设备路由。
- `docs/mobile-local-build-runbook.md`
  - Native mobile 本地运行和编译说明，覆盖 Expo Go、development build、真机调试和国内网络建议。
- `docs/native-mobile-completion-status.md`
  - Native mobile PR1-PR14 completion pass 状态、当前验证命令和剩余 PR15/PR16 收尾。

## 已完成计划

这些文档记录已经落地的 Web/mobile Web 阶段，作为回归规则和背景参考，不再作为下一阶段主执行入口：

- `docs/session-immersive-ui-plan.md`
  - 会话页沉浸式语音 UI、Corrections/Transcript tabs、当前字幕、P2/P3 waveform 计划。
- `docs/mobile-session-stage-and-ios-audio-plan.md`
  - 移动端全屏语音舞台、iOS Web audio unlock/fallback 计划。
- `docs/persistent-session-localization-plan.md`
  - 持久会话、本地化、TTS 速度、路由 pause/resume 计划。
- `docs/product-optimization-plan.md`
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
