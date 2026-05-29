# 贡献指南

语言：[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh-CN.md)

## 开始之前

先阅读 `docs/development-rules.md` 和 `docs/project-structure.md`，了解分层规则和编码规范。

## 分支命名

```
dev/<你的用户名>/<lowerCamelOrSnakeName>
```

示例：`dev/alice/fixAudioRoute`、`dev/bob/azure_tts`

始终从最新的 `main` 创建分支：

```bash
git fetch upstream
git checkout -b dev/<你的用户名>/<topic> upstream/main
```

## 改动规范

- 改动范围只限于当前任务，不要在同一个 PR 里顺手清理无关代码。
- 沿用现有代码风格、模式和依赖，不要在未讨论的情况下引入新库。
- 服务端密钥只存在环境变量里，不要提交凭据。
- 移动端代码不能引入 Web 专用或服务端专用模块。

## Commit 消息

简短的祈使句，不加 co-author 标注。

```
Fix audio route not switching to Bluetooth on iOS
Add Azure Neural TTS provider
```

## Pull Request

- 标题：简短祈使句，不加 `[xxx]` 前缀
- Body 章节：`## Summary`、`## Proposed Changes`、`## Test Plan`
- 在 body 末尾用 `Closes #<number>` 关联 issue
- 一个 PR 对应一个逻辑改动

## Issue

标题前缀必须是以下之一：

| 前缀 | 适用场景 |
|------|----------|
| `[Feature]` | 新功能、改进、重构、维护 |
| `[Bug]` | 缺陷和回归 |
| `[Test]` | 需要代码提交的测试覆盖工作 |
| `[Documentation]` | 纯文档 |
| `[Security]` | 安全加固 |

## 运行测试

```bash
npx vitest run        # 单元测试
npm run build         # 生产构建检查（在 apps/web 目录下）
```

移动端 QA 请参考 `docs/mobile-audio-qa-checklist.md`。

## 提问

用 `[Feature]` 或 `[Documentation]` 前缀开一个 issue 发起讨论。
