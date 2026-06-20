# MeteorVoice Mobile 重构路线图

> **日期**：2026-06-20  
> **背景**：App.tsx 首次拆分（PR #310）已完成，但架构仍存在问题。后续分三个大阶段执行。

---

## 路线总览

```
PR #310 ✅ 已完成 — Hook 拆分（2693→820 行）
│
├── 第一阶段 🔵 进行中 — Context 架构重构
│   ├── 1.1 创建 SessionContext + LogContext
│   ├── 1.2 AppInner 去上帝化（编排 inline，消灭 55+ 参数 Hook）
│   ├── 1.3 Screen 自治（删 props，各管各的）
│   └── 1.4 清理死代码（删 useSessionWorkflow/usePreferences/useHistory/useSttProvider）
│
├── 第二阶段 ⬜ 待开始 — 路由改造
│   ├── 2.1 引入 expo-router（文件路由 + 深链接）
│   ├── 2.2 Tab 导航迁移（手工 switch → expo-router Tab）
│   ├── 2.3 返回栈 + 转场动画
│   └── 2.4 TabIcon 替换为 SVG/图标库
│
└── 第三阶段 ⬜ 待开始 — 代码风格统一
    ├── 3.1 Import 风格统一（分组 + 字母排序 + type 独立）
    ├── 3.2 Hook Deps 嵌套对象改造
    ├── 3.3 JSDoc 规范（全部 Hook + 关键函数）
    ├── 3.4 空行/分组/注释规范
    ├── 3.5 `as any` 消除 + Ref bridge 封装
    └── 3.6 ESLint 规则收紧（提交前拦截）
```

---

## 第一阶段：Context 架构重构

**分支**：`dev/refactor/mobile-context-architecture`  
**预估**：6-8h  
**目标**：AppInner 820→350 行，最大 Hook 参数 55+→~8，消灭 prop drilling

### 1.1 创建 Context（2 文件）

| 文件 | 内容 |
|------|------|
| `SessionContext.tsx` | 会话状态 + 操作（snapshot、messages、startSession、endSession 等） |
| `LogContext.tsx` | 日志系统（logMetric、logUserAction、voiceMetrics） |

### 1.2 AppInner 重构

- 编排函数 inline 化（`startSession`、`submitTurn`、`endSession` 等搬回闭包）
- 引擎 Hook 精简（`usePlaybackEngine`、`useXunfeiStt`、`useTTSEngine`）
- `renderScreen()` switch → 条件渲染

### 1.3 Screen 自治

| Screen | 当前 | 改造后 |
|------|------|------|
| SessionScreen | 20+ props | `useSession()` 取值，自己管 UI 状态 |
| HomeScreen | 8 props | `useSession()` 取值，自己管场景列表 |
| HistoryScreen | 10 props（从 AppInner） | 自己管历史 state + API 调用 |
| SettingsScreen | 30+ props（从 AppInner） | 自己管设置 state + API 调用 |

### 1.4 清理

删除：`useSessionWorkflow.ts`、`usePreferences.ts`、`useHistory.ts`、`useSttProvider.ts`

---

## 第二阶段：路由改造

**分支**：`dev/refactor/mobile-expo-router`  
**预估**：10-14h  

### 2.1 引入 expo-router

```
app/
├── _layout.tsx          ← Root layout（ThemeProvider、LogProvider）
├── (tabs)/
│   ├── _layout.tsx      ← Tab layout（TabBar）
│   ├── session.tsx      ← SessionScreen
│   ├── home.tsx         ← HomeScreen
│   ├── history.tsx      ← HistoryScreen
│   └── settings.tsx     ← SettingsScreen
```

### 2.2 Tab 导航迁移

- 删 `activeTab` state + `selectTab` + `renderScreen` switch + `TabIcon` 手工绘制
- 用 expo-router `Tabs` + `usePathname` 代替

### 2.3 深链接 + 转场

- URL scheme：`meteorvoice://session`、`meteorvoice://settings`
- 平台原生转场动画（stack navigation）

### 2.4 TabIcon 替换

- 手工 `View` 图标 → `@expo/vector-icons` 或自定义 SVG

---

## 第三阶段：代码风格统一

**分支**：`dev/refactor/mobile-code-style`  
**预估**：分 3 步，共 14h  
**详细方案**：见 `apps/mobile/CODE_STYLE_GUIDE.md`

### 3.1 结构性改善（P0，~8h）

| 步骤 | 内容 | 影响文件 |
|:--|------|------|
| 3.1a | Hook Deps 拆为嵌套子对象 | 3 个 engine hook |
| 3.1b | JSDoc 规范（`@deps`/`@returns`/`@sideEffects`） | 全部 hook 文件 |
| 3.1c | Hook 声明顺序 + wiring 集中 | App.tsx |

### 3.2 视觉一致性（P1，~4h）

| 步骤 | 内容 | 影响文件 |
|:--|------|------|
| 3.2a | Import 统一（分组 + 内部字母序 + 外部按数量/字母序） | 全部 .ts/.tsx |
| 3.2b | 解构分组注释（>5 属性必须分组） | 全部 hook 文件 |
| 3.2c | 空行规范（不同段空 1 行，同段不空） | 全部文件 |

### 3.3 反模式消除（P2，~2h）

| 步骤 | 内容 | 影响文件 |
|:--|------|------|
| 3.3a | Ref bridge 提取 `createHandlerBridge()` | 新增 1 文件 + App.tsx |
| 3.3b | `as any` 消除（修复 hook 接口类型） | 全部 hook 接口 |
| 3.3c | ESLint 规则收紧（`no-explicit-any: error` 保留，新增警告不通过 CI） | `.eslintrc` |

---

## 进度跟踪

| 阶段 | 分支 | Issue | PR | 状态 |
|------|------|:--:|:--:|:--:|
| 一：Context 重构 | `dev/refactor/mobile-context-architecture` | — | — | 🔵 进行中 |
| 二：路由改造 | `dev/refactor/mobile-expo-router` | — | — | ⬜ 待开始 |
| 三：代码风格 3.1 | `dev/refactor/mobile-code-style` | — | — | ⬜ 待开始 |
| 三：代码风格 3.2 | 同上 | — | — | ⬜ 待开始 |
| 三：代码风格 3.3 | 同上 | — | — | ⬜ 待开始 |
