# MeteorVoice 代码风格规范

> 基于 PR #318 实际改动反向生成。全工程 122 文件已统一。

---

## 一、注释规范

### 1.1 文件头

每个包含 `export` 的文件顶部必须有双语多行 JSDoc。全工程 85+ 文件已添加。

```typescript
/**
 * Mobile preferences sync utilities.
 * 移动端偏好同步工具。
 */
```

### 1.2 函数 / 接口

导出函数和接口使用多行 JSDoc。全工程 70+ 函数已添加。

```typescript
/**
 * Creates a MeteorVoice API client with retry and timeout.
 * 创建带重试和超时的 MeteorVoice API 客户端。
 */
export function createMeteorVoiceApiClient() { }

/**
 * SessionContext — session state and operations shared across screens.
 * 会话上下文 — 跨 Screen 共享的会话状态和操作。
 */
export interface SessionContextValue { }
```

### 1.3 变量 / 行内 / 行尾

使用单行 `//`。

```typescript
const postPlaybackListenDelayMs = 900  // 播放后恢复录音的静默间隔
const isSessionRoute = pathname.startsWith('/session')
```

### 1.4 分区标题

使用 `// ─── English / 中文 ───`（全工程 55+ 处已统一）。

```typescript
// ─── Session State / 会话状态 ───
const [snapshot, setSnapshot] = useState(...)

// ─── Derived Values / 派生值 ───
const scenario = useMemo(() => ...)
```

禁止格式：`// ── 中文 ──`、`// ─── Name ───`、`// ────────────`。

---

## 二、Import 规范

### 2.1 `import type` 独立

类型导入不与值导入混行。全工程 0 处混合。

```typescript
// ❌ 禁止
import { createClient, type Session } from '@supabase/supabase-js'

// ✅ 正确
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
```

### 2.2 分组

按来源分 3 组，组间空一行：

1. 外部包（React / React Native / Next.js / Expo / 第三方 npm 包 / Node 内置模块）
2. Monorepo 包（`@meteorvoice/*`）
3. 项目内部（`@/lib/*`、`./`、`../`）

每组内先按 import 类型聚类：`import type` → `import * as` → 普通值导入。

每个聚类内部再按形态排序：单行在上，多行在下；同为单行或同为多行时，先按导入项数量由少到多，再按路径 A→Z。

`import type` 不能和值导入混行；`import * as` 也独立成块。

```typescript
import type { ReactNode } from 'react'
import type {
  AppStateStatus,
  LayoutChangeEvent,
} from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useState,
} from 'react'

import type { WorkflowSnapshot } from '@/lib/conversation-workflow'
import type {
  AccentProfile,
  Scenario,
} from '@/lib/scenarios'
import {
  createInitialSnapshot,
} from '@/lib/conversation-workflow'
import {
  accentProfiles,
  scenarios,
} from '@/lib/scenarios'
```

### 2.3 排序

**花括号内部**：按字母序 A→Z。

**花括号外部（文件级）**：

1. 先按来源分组。
2. 组内按 import 类型聚类：`import type` → `import * as` → 普通值导入。
3. 每个聚类内单行在上，多行在下。
4. 同为单行或同为多行时，导入项数量少的在上、数量多的在下。
5. 导入项数量相同时，按路径 A→Z。

```typescript
import type { AppStateStatus } from 'react-native'
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
} from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  AppState,
  Pressable,
  SafeAreaView,
  View,
} from 'react-native'

import type { WorkflowSnapshot } from '@meteorvoice/session-core'
import type {
  HistorySession,
  SessionTurnDto,
} from '@meteorvoice/api-client'
import {
  displayErrorFeedback,
} from '@meteorvoice/shared'
import {
  createMeteorVoiceApiClient,
  formatApiRequestError,
} from '@meteorvoice/api-client'

import type { TTSSpeed } from '@/lib/tts-speed'
import type {
  AccentProfile,
  Scenario,
} from '@/lib/scenarios'
import {
  cn,
} from '@/lib/utils'
import {
  useMobileAuth,
} from './mobileAuth'
```

### 2.5 换行

同源导入 2 个及以上时，必须换行，每行一个，首尾括号独占一行。

```typescript
import {
  AppState,
  Pressable,
  SafeAreaView,
  View,
} from 'react-native'
```

---

## 三、命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `SessionScreen` |
| Hook | `use` + PascalCase | `useSession` |
| 回调 prop | `on` + PascalCase | `onStart` |
| 处理函数 | `handle` + PascalCase | `handleUnauthorized` |
| 布尔 | `is`/`has`/`can` | `isSessionActive` |
| Ref | 以 `Ref` 结尾 | `snapshotRef` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_PLAYBACK_COOLDOWN_MS` |
| 类型 | PascalCase，无 `I` 前缀 | `SessionWorkflowDeps` |

---

## 四、Hook 规范

### 4.1 Deps 嵌套

超过 5 个属性按职责拆分（useXunfeiStt 22→6 组）：

```typescript
interface Deps {
  network:   { api, auth }
  context:   { locale, selectedScenarioKey }
  refs:      { snapshot, sessionGeneration, sttStreamId, ... }
  session:   { sessionActive, routePresence, canListenOnRoute, ... }
  callbacks: { logMetric, setStatus, enqueueSttOperation, ... }
  bridge:    { nativeSpeechStart, finalTranscript, ... }
}
```

### 4.2 Ref Bridge

跨 Hook 回调转发使用 `createHandlerBridge()`：

```typescript
import { createHandlerBridge } from './utils/handlerBridge'

const onResult = createHandlerBridge<(t: string) => void>()
useHookA({ onResult: useCallback(t => onResult.current(t), []) })
useEffect(() => { onResult.current = hookB.handleResult })
```

---

## 五、空行规范

- import 组间空一行
- 分区标题前空一行
- 同逻辑块内不空行
- `useCallback` / `useEffect` 之间空一行

---

## 六、TypeScript 规范

- `strict: true`
- 禁止 `any`（除 `useXunfeiStt.ts` 文件级 disable + Supabase JSON 列）
- `import type` 用于纯类型导入
- 接口优于 `type`（对象形状）

---

## 七、双语规范

英文在前，中文在后。多行 JSDoc 格式：

```typescript
/**
 * English description.
 * 中文描述。
 */
```

分区标题格式：

```
// ─── English Name / 中文名 ───
```

---

## 八、自审查命令

每个 commit 前必须跑，全部为零/通过：

```bash
# 单行 JSDoc 残留
grep -rn "^/\*\* .* / .* \*/" packages/ apps/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l

# 混合 type+value import
grep -rn "import {.*, type .*} from" packages/ apps/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l

# 有 export 无文件头
for f in $(find packages apps -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v ".next" | grep -v ".bak" | grep -v ".d.ts"); do head -1 "$f" | grep -q "^/\*\*\|^/\* eslint\|^'use client'" || { grep -q "^export" "$f" 2>/dev/null && echo "$f"; }; done | wc -l

# 类型检查
npx tsc --noEmit

# Lint
npx eslint packages/ apps/ --ext .ts,.tsx --quiet

# 测试
npx vitest run
```
