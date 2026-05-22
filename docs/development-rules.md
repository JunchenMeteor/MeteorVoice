# MeteorVoice 开发协作规则

本文件定义 MeteorVoice 仓库内开发、文档、issue/PR、worktree/main 同步和测试的统一规则。所有 agent 和开发者 MUST 遵守。

## 基础原则

- MUST 尊重当前工作区中已有改动。不要回退、覆盖或格式化与当前任务无关的文件。
- MUST 保持改动范围与任务一致。文档任务只改 `docs/`；功能任务只改相关模块。
- MUST 优先沿用现有架构和命名，不为单个需求引入不必要的新抽象。
- SHOULD 让产品规则、工程步骤和验收标准写在文档中，便于后续 AI agent 直接执行。
- 禁止在未确认的情况下删除历史资料、迁移记录或交接文档。

## 目录和分层规则

参考 `docs/project-structure.md`。核心约束如下：

- `apps/web/app/` MUST 只放 Web 页面和 route handlers。
- `apps/web/components/` MUST 只放 Web 可复用 UI。
- `apps/web/lib/server/` MUST 放 server-only 业务逻辑、provider orchestration 和请求处理辅助逻辑。
- `packages/shared/` SHOULD 放跨端共享类型、常量、i18n 和基础校验。
- `apps/web/lib/providers/` MUST 隔离 Web/API 侧 STT/TTS/AI provider 适配逻辑。
- `docs/` MUST 只放产品、实施和协作资料。
- Secrets MUST 只存在 server-side 环境变量中，禁止进入客户端代码或文档示例中的真实值。

当前 monorepo 路径约束：

- Web 页面和 route handlers MUST 放在 `apps/web/app/`。
- Web reusable UI MUST 放在 `apps/web/components/`。
- Web server-only 业务逻辑 MUST 放在 `apps/web/lib/server/`。
- Web provider adapters MUST 放在 `apps/web/lib/providers/`。
- Native mobile code MUST 放在 `apps/mobile/`，禁止 import `apps/web/*`。
- 跨端 i18n、scenario、accent、speech capability 和基础类型 SHOULD 放在 `packages/shared/`。
- 跨端 API client SHOULD 放在 `packages/api-client/`。
- 平台无关 session/turn lifecycle SHOULD 放在 `packages/session-core/`。

## Issue 规则

- 开始较大功能前，SHOULD 先确认是否已有对应 issue。
- 新建 issue 时，标题 MUST 使用英文，并以 `[Feature] ...` 或 `[Fix] ...` 开头。
- 新建 issue 时，body MUST 包含以下固定结构：
  - `## Summary`
  - `## Expected Behavior`
  - `## Proposed Changes`
  - `## Test Plan`
- fix 类 issue MUST 使用 `bug` label；feature 类 issue MUST 使用 `enhancement` label。
- 禁止为同一工作重复创建 issue。
- 当用户明确要求不要创建 issue 时，MUST 不创建。

## PR 规则

- 分支名 MUST 使用 `dev/<description>/<feature>`，例如 `dev/feature/session-immersive-ui`。
- PR 标题 MUST 使用英文，并以 `[Feature] ...` 或 `[Fix] ...` 开头。
- PR SHOULD 聚焦一个可 review 的主题，避免把 UI 重构、provider 改动和数据库迁移混在一起。
- PR body MUST 使用以下顺序：
  - `## Summary`
  - `## Test Plan`
  - `Closes #<issue>` 放在正文最后。
- 多个 issue 关闭语句 MUST 放在 `Test Plan` 后面，每行一个，例如：

```md
## Summary
- ...

## Test Plan
- npm run lint
- npm test

Closes #47
Closes #48
```

- 涉及语音会话、TTS/STT、持久化、本地化或权限的 PR，MUST 附手动验收结果。
- 禁止在未运行基本验证时宣称功能完成；如果测试受环境限制未运行，MUST 明确说明。
- 当用户明确要求不要创建 PR 时，MUST 不创建。

## Worktree 和 main 同步规则

- 开始工作前，MUST 确认当前分支和 `git status`。
- 如果要从主目录切出 worktree 或进行多 agent 并行开发，MUST 先在主目录切到 `main`，拉取 `origin/main`，并确认无未提交改动。
- main 已同步时，SHOULD 从当前任务分支继续，不要无故切换分支。
- 需要同步 main 时，MUST 使用非破坏性流程，例如 `git fetch` 后 rebase/merge 当前分支；禁止 `git reset --hard` 覆盖本地改动。
- 如果 worktree 内存在他人改动，MUST 保留并绕开；只有改动与当前任务直接冲突时才询问用户。
- 禁止删除其他 agent 的工作分支、stash 或未提交文件。
- 禁止在用户未要求时提交、push、创建 PR 或合并 PR。

## 长期分支规则

- `main` 是日常集成主线，功能、修复和架构升级里程碑最终 SHOULD 合入 `main`。
- `release` 是长期稳定发布/预发布分支，SHOULD 只接收从 `main` 挑选或合入的已验证变更。
- 禁止把 `release` 当作日常开发分支。
- 发布版本 SHOULD 使用 tag 表达，例如 `v0.1.0`，不要为每个版本创建长期 release 分支。
- 日期或版本分支 MAY 用于短期 hotfix 或候选发布，例如 `release/v0.1.1-rc`，完成后 SHOULD 删除。
- `dev/architecture/native-mobile` 曾用于 native mobile 架构升级长期集成。当前双端架构骨架已合入 `main`，新的产品化阶段 SHOULD 以 `docs/architecture-productization-roadmap.md` 为准；如用户要求重启长期架构分支，再按任务创建。

## 多语言和文案规则

- UI 文案 MUST 支持中文和英文，默认通过 `packages/shared/src/i18n.ts` 集中管理。
- 会话内容 MAY 以英语为主，因为产品目标是英语口语练习；导航、状态、错误和设置文案 MUST 可本地化。
- Scenario、accent、difficulty、status、correction type、provider label SHOULD 使用本地化 helper 渲染，不直接暴露 raw enum。
- 禁止向用户展示内部 UUID、relation id、内部邮箱别名或数据库字段名。

## 语音会话工程规则

- 麦克风 MUST 只在用户明确开始 active session 后启用。
- 离开 `/session` 时 MUST 暂停监听；返回 `/session` 且会话仍 active 时 MAY 恢复下一轮监听。
- 会话结束时 MUST 停止 STT、TTS、计时器、pending turn 和所有录音状态。
- Live session 禁止使用 mock/generated STT 驱动用户输入；mock provider 只能用于开发演示或明确的测试模式。
- 每个真实用户 utterance MUST 最多触发一次 AI reply；禁止因为 silence/no-speech 自动合成用户 turn。
- Corrections MUST 非阻塞展示，不应隐藏麦克风、继续按钮或核心对话区。

## TTS/STT 时序规则

每轮语音交互 MUST 遵守以下顺序：

1. 用户触发或系统进入 listening。
2. STT 捕获真实用户语音并产出 transcript。
3. 前端/会话引擎锁定 active turn，防止并发 turn。
4. AI 生成 reply 和可选 corrections。
5. TTS 播放 AI reply。
6. TTS 结束后释放 turn lock。
7. 如果 session 仍 active 且当前路由是 `/session`，进入下一次 listening 等待真实用户输入。

禁止项：

- 禁止 STT 在 TTS 播放期间继续捕获 AI 声音作为用户输入。
- 禁止多个 TTS 播放重叠。
- 禁止重复点击导致并发 AI reply。
- 禁止 provider 未配置时静默失败；MUST 给出可理解的 fallback 或错误状态。

## 测试要求

最低验证 SHOULD 包含：

```bash
npm run build
npm test
```

涉及前端体验时，SHOULD 额外运行本地应用并手动检查桌面和移动宽度。语音会话相关改动 MUST 手动验证：

- 开始/结束 session。
- 用户说一句后，AI 只回复一次。
- 用户沉默时，对话不会自己继续。
- TTS 播放期间不会触发 STT 用户输入。
- Corrections 面板不阻塞下一轮对话。
- 离开 `/session` 后麦克风暂停，返回后同一会话恢复。
- 中文/英文 UI 文案都能正常显示，文本不溢出。

如果缺少 provider credentials、浏览器 STT 权限或 CI 环境不支持语音，MUST 在交付说明中写明未验证项和原因。
