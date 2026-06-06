# Deployment Runbook

本文档记录 MeteorVoice monorepo 迁移后的 Web 部署方式。当前 Web app 位于 `apps/web`，Mobile 位于 `apps/mobile`，共享包位于 `packages/*`。

## Vercel 推荐配置

当前推荐让 Vercel 仍从仓库根目录安装和构建，因为 npm workspaces、`file:` 本地包和 lockfile 都在根目录。

- Root Directory: repository root / blank
- Production Branch: `release`
- Install Command: `npm install`
- Build Command: `npm --workspace @meteorvoice/web run build`
- Output Directory: `apps/web/.next`

仓库根目录的 `vercel.json` 已记录上述 build/install/output 配置。

## 为什么不直接把 Root Directory 设为 apps/web

`apps/web` 依赖根目录 workspace 和本地包：

- `packages/shared`
- `packages/api-client`
- `packages/session-core`
- root `package-lock.json`

如果 Vercel Root Directory 直接设为 `apps/web`，安装阶段可能无法正确解析这些 workspace/file dependencies。除非后续把 Web package 改造成完整独立 package 并调整 Vercel install command，否则 SHOULD 保持 Root Directory 为仓库根目录。

## 环境变量

Vercel 环境变量仍配置在项目级，不跟随文件迁移。检查项：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `ASR_PROVIDER`
- `TTS_PROVIDER`
- ASR/TTS provider secrets：Xunfei、Volcengine、Tencent、Azure

本地 Web env 示例见 `apps/web/.env.local.example`。

## 分支职责

- `main`
  - 完整 monorepo 集成和预览分支。
  - 接收架构升级、Web/Mobile 共同能力、后续开发，并触发 preview deployment。
- `release`
  - 稳定生产发布分支。
  - production deployment SHOULD 只由 `release` 触发。
  - 发布新版本时 MUST 完整合入上次发布节点之后 `main` 上的全部改动，不得选择性 cherry-pick。
- `dev/architecture/native-mobile`
  - 本轮 native mobile 架构升级长期集成分支。
  - PR16 合入 `main` 后可以保留为历史分支，不再作为默认开发入口。

## 发布流程

1. 功能分支先合入 `main`。
2. 本地或 CI 验证：
   ```bash
   npm run lint
   npm test
   npm run mobile:config
   ```
3. Web 预览部署检查通过。
4. 需要发布时，从 `main` 提 PR 到 `release`，或本地在 `release` 上执行 `git merge --no-ff main` 后 push。
5. 发布合并 MUST 包含上次发布节点之后 `main` 上的全部改动；如果某个改动不能发布，先在 `main` revert 或修正，再发布修正后的完整 main。
6. `release` 触发 production deployment。

## 手动触发生产部署

如果 Vercel production branch 为 `release`：

```bash
git checkout release
git pull origin release
git merge --no-ff main
git push origin release
```

或者在 Vercel CLI 中使用生产部署，但 SHOULD 优先通过 `release` 分支留痕。

## 回滚

- Web 回滚优先使用 Vercel dashboard 回滚到上一稳定 deployment。
- 代码回滚通过 PR revert，避免直接 force push `main` 或 `release`。
- Mobile 本地 build 不影响 Web production deployment，除非共享包或 API contract 同时变更。
