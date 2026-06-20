# Mobile Architecture Refactor Plan

> **日期**：2026-06-20  
> **分支**：`dev/refactor/mobile-context-architecture`  
> **前置**：PR #310（App.tsx 拆分为 7 个 Hook，已合并 main）  
> **后续**：路由改造 → 全项目代码风格改造  

---

## 目标

优化 `apps/mobile/src/App.tsx` 的架构，使其对标 Web 端 `VoiceSessionProvider` 的 Context + 引擎 Hook 模式。

## 当前架构问题

```
AppInner（820 行，上帝组件）
├── 39 个 useState（覆盖 4 个 Screen + 全局）
├── 43 个 useRef
├── 7 个互锁 Hook（最大 55+ 参数）
├── 20 个 useEffect
├── renderScreen() switch 硬切 Screen
└── 所有 Screen 通过 10-30 个 props 接收数据（prop drilling）
```

## 目标架构

```
App.tsx
├── ThemeProvider
├── LogProvider          ← 新增：日志系统，全局可用
├── AuthProvider
│
└── AppInner（~350 行）
    │
    ├── 引擎 Hook（内部使用，Screen 不可见）：
    │   ├── usePlaybackEngine()        ← 0 参数，对标 Web
    │   ├── useTTSEngine({...})        ← ~8 参数，对标 Web
    │   ├── useXunfeiStt({...})        ← ~8 参数，保留
    │   └── useVoiceMetrics({...})     ← ~5 参数，精简
    │
    ├── 编排函数（inline，闭包自动捕获）：
    │   ├── startSession()
    │   ├── submitTurn()
    │   ├── handleNativeFinalTranscript()
    │   ├── handleListeningEndedWithoutTranscript()
    │   ├── endSession()
    │   ├── selectScenario()
    │   └── playCorrection()
    │
    ├── SessionContext.Provider（~15 个值）：
    │   │  snapshot, messages, corrections, summary
    │   │  isSessionActive, status, busy
    │   │  audioUrl, locale, selectedScenarioKey, selectedAccentKey
    │   │  startSession, endSession, playCorrection, selectScenario
    │   │
    │   ├── SessionScreen   ← 从 Context 取，自己管 UI 状态
    │   ├── HomeScreen      ← 从 Context 取，自己管场景列表
    │   ├── HistoryScreen   ← 自己管历史（独立数据源）
    │   └── SettingsScreen  ← 自己管设置（独立数据源）
    │
    └── TabBar ← activeTab 不变

Screen 组件改为条件渲染（activeTab === 'session' && <SessionScreen />），不再用 switch。
```

## 改动清单

### Step 1：创建 Context（新增 1 文件）

**`apps/mobile/src/SessionContext.tsx`**

```typescript
export interface SessionContextValue {
  // 会话数据
  snapshot: WorkflowSnapshot
  messages: ConversationMessage[]
  corrections: ConversationResponse['corrections']
  summary: string | null
  // 会话状态
  isSessionActive: boolean
  status: string
  busy: boolean
  // 音频
  audioUrl: string | null
  // 场景 / 口音
  selectedScenarioKey: string
  selectedAccentKey: string
  // 操作
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  playCorrection: (text: string) => void
  selectScenario: (key: string) => Promise<boolean>
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within AppInner')
  return ctx
}
```

### Step 2：创建 LogProvider（新增 1 文件）

**`apps/mobile/src/LogContext.tsx`**

提取 `useVoiceMetrics` 中的日志能力，不绑定编排生命周期：

```typescript
export interface LogContextValue {
  logMetric: (stage: string, data?: Record<string, unknown>) => void
  logUserAction: (action: string, data?: Record<string, unknown>) => void
  voiceMetrics: VoiceMetricEntry[]
  voiceMetricsText: string
  clearVoiceMetrics: () => void
}
```

### Step 3：AppInner 重构

**删除**：
- `useSessionWorkflow`（766 行）—— 编排逻辑搬回 AppInner 内联
- `usePreferences`（353 行）—— 逻辑搬到 SettingsScreen
- `useHistory`（106 行）—— 逻辑搬到 HistoryScreen
- `useSttProvider`（163 行）—— Provider/URL 逻辑搬到 SettingsScreen，STT ref wiring 留在 AppInner
- `renderScreen()` switch —— 改为条件渲染

**修改**：
- `useVoiceMetrics` → 拆为 `LogContext`（全局）+ 编排专用函数（inline）
- `usePlaybackQueue` → 改为 `usePlaybackEngine`（对标 Web，0 参数或极少参数）
- `useXunfeiStt` → 精简接口（~8 参数）

**新增**：
- `SessionContext.Provider`
- 编排函数：`startSession`, `submitTurn`, `handleNativeFinalTranscript`, `handleListeningEndedWithoutTranscript`, `endSession`, `selectScenario`, `playCorrection`
- 条件渲染：`{activeTab === 'session' && <SessionScreen />}`

### Step 4：Screen 组件改造

**SessionScreen**：删掉所有 props，改为 `useSession()` 取值，自己管理 UI 状态。

**HomeScreen**：删 props，`useSession()` 取值，自己管场景列表。

**HistoryScreen**：从 AppInner 接收 history state → 改为自己管 `useState` + `api` 调用。

**SettingsScreen**：从 AppInner 接收 30+ props → 改为自己管全部设置 state 和 API 调用。

### Step 5：删除文件

```
删除：
  apps/mobile/src/hooks/useSessionWorkflow.ts  ← 编排回归 AppInner
  apps/mobile/src/hooks/usePreferences.ts      ← 移入 SettingsScreen
  apps/mobile/src/hooks/useHistory.ts          ← 移入 HistoryScreen
  apps/mobile/src/hooks/useSttProvider.ts      ← 拆散到 SettingsScreen + AppInner

修改：
  apps/mobile/src/hooks/useVoiceMetrics.ts     ← 拆为 LogContext（export）+ 编排专用（inline）
  apps/mobile/src/hooks/usePlaybackQueue.ts    ← 改为 usePlaybackEngine
  apps/mobile/src/hooks/useXunfeiStt.ts        ← 精简接口

新增：
  apps/mobile/src/SessionContext.tsx           ← 会话 Context
  apps/mobile/src/LogContext.tsx               ← 日志 Context

重度修改：
  apps/mobile/src/App.tsx                      ← 上帝 → 编排者
  apps/mobile/src/screens/SessionScreen.tsx     ← 删 props，改为 Context
  apps/mobile/src/screens/HomeScreen.tsx        ← 删 props，改为 Context
  apps/mobile/src/screens/HistoryScreen.tsx     ← 接收全量 state → 自己管理
  apps/mobile/src/screens/SettingsScreen.tsx    ← 接收全量 state → 自己管理
```

## 验证计划

- [ ] TypeScript type check (`npx tsc -p tsconfig.json --noEmit`)
- [ ] ESLint 0 errors
- [ ] All 118 vitest tests pass
- [ ] 确认 `useSession()` 在 Provider 外调用时抛错
- [ ] AppInner 行数：820 → ~350
- [ ] 最大 Hook 参数：55+ → ~8
- [ ] Screen 组件 props：10-30 → 0-3

## 不变的东西

- 产品逻辑完全不变
- TabBar 导航机制不变（路由改造在下一个 PR）
- API 调用方式不变
- 所有现有的 ref 引用模式在编排函数中不变（仍在同一个闭包作用域）
