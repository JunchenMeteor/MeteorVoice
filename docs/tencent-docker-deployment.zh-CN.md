# 腾讯云 Docker 部署

本文定义 MeteorVoice Web/API 在现有腾讯云服务器上的目标 Docker 部署方式。容器化范围只包括服务端 Web/API；iOS App、托管 Supabase 和宿主机 Nginx 不进入 Docker。

> 状态：目标设计。完成本文验收清单之前，腾讯云当前仍使用 PM2 部署。

## 环境映射

| 分支 | 环境 | 域名 | 宿主机端口 | Compose 项目 | 运行时环境文件 |
| --- | --- | --- | ---: | --- | --- |
| `main` | 预览 | `mv-pre.jcmeteor.com` / `mv-pre-cn.jcmeteor.com` | `3101` | `meteorvoice-preview` | `/etc/meteorvoice/meteorvoice.env` |
| `release` | 生产 | `meteorvoice.jcmeteor.com` / `mv-cn.jcmeteor.com` | `3100` | `meteorvoice-production` | `/etc/meteorvoice/meteorvoice.env` |

Nginx MUST 继续监听公网 80/443 端口。容器 MUST 只发布到 `127.0.0.1`。

## 目标交付流程

1. GitHub 托管 Runner 检出目标提交。
2. CI 执行 lint、测试、Mobile typecheck 和 Web 生产构建。
3. CI 将多阶段 Next.js standalone 镜像导出为压缩的 GitHub Actions Artifact。
4. 镜像使用不可变 commit SHA 标签；分支和版本号 MAY 作为别名，但部署 MUST 最终解析到 SHA 标签。
5. MeteorVoice 专属腾讯 Runner 下载 Artifact、将不可变镜像加载到 Docker，并只更新对应 Compose 项目。
6. Runner 等待容器健康检查并验证公网域名。
7. 健康检查失败时 MUST 恢复上一镜像 SHA。

迁移完成后，服务器 MUST 不再执行 `git fetch`、`npm ci` 或 `next build`。

## 镜像契约

- 镜像标签：`meteorvoice-web:<commit-sha>`。
- 构建上下文：仓库根目录，因为 Web 依赖 `packages/*` npm workspaces。
- Next.js MUST 使用 `output: 'standalone'`。
- 运行阶段 MUST 只包含 standalone server、静态资源和必要 public 文件。
- 运行进程 MUST 使用非 root 用户。
- 密钥 MUST NOT 复制进镜像或通过 Docker build argument 传入。
- `.dockerignore` MUST 排除 `.git`、`.env*`、本地构建输出、日志和 Mobile/native 构建产物。

## 配置与密钥

真实 provider 凭据继续保存在 `/etc/meteorvoice/meteorvoice.env`，由 root 持有，并按部署和运行所需设置最小读取权限。Compose 在容器启动时注入该文件。

GitHub Actions 保留压缩镜像七天，并通过 workflow Artifact 服务传输，不需要镜像仓库密码。讯飞、DeepSeek、Supabase service-role 等应用密钥不得进入镜像 Artifact。

## Compose 要求

预览和生产 MUST 使用不同的 Compose 项目名、容器和网络。每个服务 MUST 定义：

- `restart: unless-stopped`；
- Web/API 健康检查；
- JSON 日志轮转（`max-size: 10m`、`max-file: 3`）；
- 适配当前 3.6 GiB 服务器的内存限制；
- 不可变镜像 SHA；
- `127.0.0.1:3101` 或 `127.0.0.1:3100` 绑定。

部署元数据 MAY 放在 `/srv/containers/meteorvoice/{preview,production}`；应用密钥 MUST 保留在 `/etc/meteorvoice`。

## 首次从 PM2 迁移

每次只迁移一个环境，必须先预览后生产。

1. 记录当前 Git commit、PM2 进程、Nginx 配置和公网健康结果。
2. 构建并推送候选镜像，不改变服务器运行状态。
3. 在未使用的 localhost 端口启动影子容器，验证 Web 页面以及 `/api/scenarios`、`/api/chat` 参数校验和 TTS 参数校验。
4. 只将当前环境的 Nginx upstream 切到影子容器并执行公网检查。
5. 只停止对应 PM2 进程。
6. 在原 `3101` 或 `3100` 端口启动最终 Compose 项目，并将 Nginx 恢复指向该端口。
7. 观察日志和健康状态后，再迁移下一个环境。

禁止执行 `pm2 kill`。两个环境完成观察期之前，保留 PM2 定义和服务器源码目录。

## 日常部署

日常部署只更新一个分支环境：

1. 解析新的不可变镜像 SHA；
2. 记录当前运行 SHA；
3. 下载并加载镜像 Artifact；
4. 使用本地不可变镜像更新对应 Compose 项目；
5. 等待容器健康；
6. 验证 localhost 端口和公网域名；
7. 保留上一 SHA 用于回滚。

## 回滚

普通 Docker 回滚应将部署元数据改回上一镜像 SHA，然后重新执行 Compose pull/up。关闭故障前必须同时验证 localhost 和公网健康。

首次迁移期间，如果 Docker 无法承载该环境：

1. 停止失败的 Compose 项目；
2. 如 Nginx upstream 已变更，恢复旧配置；
3. 只重启 PM2 中的 `meteorvoice` 或 `meteorvoice-release`；
4. 验证原端口和公网域名。

## 验收清单

- CI 构建、标记和部署的是同一个 commit。
- 镜像历史、构建日志和 Artifact 元数据中不存在应用密钥。
- 预览与生产可独立部署、独立回滚。
- 容器只绑定 localhost。
- reload 前 Nginx 配置通过 `nginx -t`。
- 删除 PM2 定义前完成 PM2 回滚验证。
- 预览和生产域名均返回 HTTP 200。
- 完成 Auth、场景加载、Chat、讯飞 ASR/TTS 和 Mobile API 兼容验证。
- Docker 日志已轮转，旧镜像有明确保留策略。

## 相关文档

- `docs/deployment-runbook.md`：分支和发布职责。
- `docs/release-manager.md`：发布自动化。
- `docs/tts-integration.md`：语音 provider 运行时密钥。
- `docs/mobile-local-build-runbook.md`：iOS 构建和 API 端点行为。
