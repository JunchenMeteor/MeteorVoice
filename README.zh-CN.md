# MeteorVoice

<p align="center">
  <strong>一个支持语音对话、实时纠错、口音轮换和跨设备同步的英语陪练应用</strong>
</p>

<p align="center">
  <a href="README.md"><img alt="Docs English" src="https://img.shields.io/badge/Docs-English-black" /></a>
  <a href="README.zh-CN.md"><img alt="Docs 中文" src="https://img.shields.io/badge/Docs-%E4%B8%AD%E6%96%87-red" /></a>
</p>

## 目录

- [概览](#概览)
- [核心能力](#核心能力)
- [系统架构](#系统架构)
- [仓库结构](#仓库结构)
- [安装](#安装)
- [登录](#登录)
- [存储](#存储)
- [TTS](#tts)
- [运行](#运行)
- [验证](#验证)

## 概览

MeteorVoice 是一个以语音为主的英语对话陪练工具。用户进入场景后开始会话，边说边被纠错，AI 用不同口音回复，用户可继续或结束。

这个仓库是单体 Next.js 全栈结构，页面、API 路由、共享逻辑和 Supabase 辅助代码都在同一个代码库里。

## 核心能力

- 一对一英语练习
- 场景式对话开场
- 轮次内实时纠错和轮后反馈
- 会话级口音轮换
- 对话区外支持中英双语 UI
- 使用 CSS 变量做全局主题切换
- 通过 Supabase 管理登录、历史和偏好同步
- 提供 mock AI/STT/TTS，方便本地开发

## 系统架构

- **框架**：Next.js + TypeScript
- **UI**：shadcn/ui + Tailwind CSS
- **AI 流**：Vercel AI SDK
- **对话流程**：LangGraph 作为应用内工作流层
- **数据库/认证**：Supabase
- **语音**：浏览器语音能力 + Provider 适配层

## 仓库结构

- `app/` - 页面和 API 路由
- `components/` - 可复用 UI 组件
- `lib/` - 共享 provider、workflow 和工具
- `supabase/` - 数据库 migration
- `docs/` - 产品和实施文档

## 安装

```bash
cd MeteorVoice
npm ci
cp .env.local.example .env.local
```

### Supabase

1. 创建 Supabase 项目
2. 执行 `supabase/migrations/001_init.sql`
3. 执行 `supabase/migrations/002_rls.sql`
4. 把项目 URL 和 anon key 写入 `.env.local`
5. 配置本地开发的 Authentication redirect URLs

## 登录

MeteorVoice 采用 MeteorTest 的账号输入方式。

- 一个输入框同时支持 `username`、`phone` 或邮箱
- `username` 会先转换成内部邮箱别名，再走 Supabase Auth
- `phone` 直接走 Supabase phone auth
- 对用户可见的仍然是 username 或 phone，别名只在内部使用

## 存储

Supabase 用来保存 session、turn、纠错项、主题偏好和学习记录。

当前 migration 状态：

- `001_init.sql` 创建 schema 和 seed 数据
- `002_rls.sql` 启用 RLS 和按用户隔离的策略
- `003_tts_preferences.sql` 增加用户级 TTS 服务商偏好

## TTS

国内用户优先使用讯飞、火山引擎和腾讯云。Google Cloud TTS 保留为海外或未来可选方案。

用户选择的语音服务商会保存到 Supabase。服务商密钥只放在服务端环境变量中，不存数据库。

详见 `docs/tts-integration.md` 和 `docs/supabase-setup.md`。

## 运行

```bash
npm run dev
```

打开 `http://127.0.0.1:3001`

## 验证

```bash
npm run build
npm test
```

## 说明

- `DEEPSEEK_API_KEY` 可选。
- 没有真实 AI 或语音密钥时，mock provider 也能运行。
