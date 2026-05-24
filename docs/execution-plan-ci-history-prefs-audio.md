# 执行计划：CI/CD 增强 · 历史页完善 · 跨设备偏好同步 · Mobile 音频硬化

本文档定义四个方向的详细执行计划，每个方向独立可操作，可拆分为独立 issue/PR。

---

## 当前基线

| 项 | 状态 |
|----|------|
| CI/CD | 已有 `.github/workflows/ci.yml`：PR/main 触发，跑 lint → mobile:typecheck → mobile:config → test + web:build。基础覆盖 OK，缺缓存/Native Build/部署。 |
| 历史页 | `/history` 页面存在，从 `/api/history` 拿 session 列表，仅展示场景/口音/日期/状态/摘要，无分页、无详情、无筛选。 |
| Preferences 同步 | `/api/preferences` 已实现 GET/PATCH，Supabase `theme_preferences` 表已扩展 locale/scenario/accent/TTS speed。但 Web 端 TTS speed 仍走 localStorage，Mobile 端默认设置未始终回写 API。 |
| Mobile 音频 | `nativeAudio.ts` 有基础录音/播放 + 前后台 AppState 处理，QA checklist 存在但未逐项验证。iOS audio interruption/route change/Bluetooth/silent mode 等边界未硬化。 |

---

## 一、CI/CD 增强

### 1.1 当前已具备

```yaml
# .github/workflows/ci.yml 已覆盖：
- Node 24 + npm ci
- lint (ESLint)
- mobile:typecheck (tsc --noEmit)
- mobile:config (expo config --type public)
- test (vitest + web:build)
```

### 1.2 缺口和改进点

#### A. 缓存加速（优先级：高）

当前 `npm ci` 每次从头安装，约 2-3 分钟。加上缓存可降到 30 秒内。

**实施步骤：**

1. 在 `actions/setup-node@v4` 后增加 npm 缓存：

```yaml
- name: Cache npm
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    restore-keys: npm-${{ runner.os }}-
```

2. 增加 Next.js 构建缓存：

```yaml
- name: Cache Next.js
  uses: actions/cache@v4
  with:
    path: |
      apps/web/.next/cache
      ${{ github.workspace }}/.next/cache
    key: nextjs-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ github.sha }}
    restore-keys: |
      nextjs-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
      nextjs-${{ runner.os }}-
```

**验收：**
- CI 运行时间从 ~4 分钟降到 ~1.5 分钟（非首次）
- `npm ci` 步骤日志显示 "Cache hit"

#### B. 分 Job 并行执行（优先级：中）

当前单个 job 串行执行所有步骤。拆分为并行 job 能更快反馈。

**实施步骤：**

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint

  packages-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx vitest run

  mobile-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run mobile:typecheck
      - run: npm run mobile:config

  web-build:
    needs: [lint, packages-test, mobile-typecheck]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run web:build
```

**验收：**
- CI 界面出现 4 个独立 job
- lint / packages-test / mobile-typecheck 并行运行
- web-build 在前三者通过后才执行
- 总 wall-clock 时间不超过 3 分钟

#### C. EAS Build 验证（优先级：低，按需启用）

仅在 mobile 代码变更时触发 EAS development build，验证 Native 层编译不挂。

```yaml
eas-build-check:
  if: contains(github.event.head_commit.message, '[mobile]') || 
      contains(github.event.head_commit.message, 'apps/mobile')
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 24, cache: npm }
    - run: npm ci
    - run: cd apps/mobile && npx eas build --platform ios --profile preview --non-interactive --no-wait
```

> **注意：** 此项需要 EXPO_TOKEN 存入 GitHub Secrets，且会消耗 EAS 构建配额。建议先和用户确认是否启用。

#### D. 环境变量注入（优先级：低）

当前 CI 没有 `.env.local` —— lint/typecheck/build 都不需要真实 API key 就能跑（mock 模式），这是正确的设计。**不需要改动。**

### 1.3 实施建议

- **先做 1.2.A（缓存）**：改动最小、收益最大
- **再做 1.2.B（分 Job）**：需要调整 yml 结构但不涉及业务代码
- **1.2.C/D 按需**：不影响当前开发节奏

---

## 二、历史页面完善

### 2.1 当前状态

`apps/web/app/history/page.tsx`：
- 请求 `/api/history` 获取 session 列表，失败则回退 localStorage
- 展示：场景名、口音、日期、状态 Badge、摘要（最多两行截断）
- 不支持：分页、搜索、按场景筛选、点击查看详情、删除、corrections 预览

`/api/history` → `listSessions()`：
- JOIN `scenarios` 和 `accent_profiles` 拿名称
- JOIN `learning_history` 拿 summary
- 返回最近 30 条

### 2.2 改进方案

#### A. Session 详情展开（优先级：高）

点击某条 session 卡片，内联展开该 session 的 turns 和 corrections。不跳新页面，避免打断浏览。

**实施步骤：**

1. 在 `history/page.tsx` 增加 `expandedId` 状态
2. 点击卡片时调用 `GET /api/sessions/:id/turns`（API 已存在，见 `apps/web/app/api/sessions/[sessionId]/turns/route.ts`）
3. 内联渲染 turns 列表，每条 turn 展示 speaker / transcript / corrections
4. 展开区域使用 `AnimatePresence` 或直接 CSS transition 避免布局抖动
5. 补 i18n key：

```typescript
// packages/shared/src/i18n.ts 新增
'history.turns': 'Turns',
'history.turns_count': '{count} turns',
'history.no_turns': 'No turns recorded',
'history.loading_turns': 'Loading turns...',
'history.load_turns_error': 'Failed to load turns',
```

**涉及文件：**
- `apps/web/app/history/page.tsx`（主要改动）
- `packages/shared/src/i18n.ts`（新增 key 中英文）

**验收：**
- 点击 session 卡片展开 turns 列表
- 再次点击收起
- 展开期间显示 loading 状态
- turns 按时间顺序排列，显示 speaker / transcript / corrections
- 中英文文案正常

#### B. 分页与"加载更多"（优先级：中）

当前 limit 30 写死在 `listSessions()`。改为支持分页参数。

**实施步骤：**

1. 在 `listSessions()` 增加 `offset` / `limit` 参数：

```typescript
export async function listSessions(options?: { offset?: number; limit?: number }) {
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  // ... query 中 .range(offset, offset + limit - 1)
}
```

2. `/api/history` 读取 query params：

```typescript
// apps/web/app/api/history/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)
  // ...
}
```

3. 前端 "Load more" 按钮，追加到现有列表而不是替换

**涉及文件：**
- `apps/web/lib/server/session.ts`
- `apps/web/app/api/history/route.ts`
- `apps/web/app/history/page.tsx`
- `packages/api-client/src/client.ts`（新增分页参数）
- `packages/api-client/src/types.ts`（新增分页 DTO）

**验收：**
- 首次加载 20 条
- 点击 "Load more" 追加后续 20 条
- 总数 < 20 时不显示按钮
- API 返回 `hasMore: boolean`

#### C. 按场景筛选（优先级：中低）

在历史页顶部加场景筛选 chip。

**实施步骤：**

1. `/api/history` 支持 `scenario` query param
2. 服务端 `listSessions()` 加 `WHERE scenario_id = ?`
3. 前端：从 `scenarios` 数组渲染 chip 列表 + "All" chip
4. 切换筛选时重置 offset 为 0

**涉及文件：**
- `apps/web/lib/server/session.ts`
- `apps/web/app/api/history/route.ts`
- `apps/web/app/history/page.tsx`

**验收：**
- 选择场景后只显示该场景的 sessions
- "All" chip 恢复全部

#### D. 删除 session（优先级：低）

每条 session 卡片右侧加删除按钮（需用户确认）。

**实施步骤：**

1. 新增 `DELETE /api/session` route，接收 `{ sessionId }` 参数
2. 服务端校验 `user_id` 匹配后软删除（status → 'deleted'）或硬删除
3. 前端加确认对话框后调用，成功后从列表中移除

> 软删除可保留数据用于分析，推荐先采用软删除。

**涉及文件：**
- `apps/web/app/api/session/route.ts`
- `apps/web/lib/server/session.ts`
- `apps/web/app/history/page.tsx`

#### E. History 数据持久化增强（优先级：低）

当前 `VoiceSessionProvider.endSession()` 同时写 localStorage 和 `/api/session/sync`。Supabase 数据是权威来源，localStorage 仅用作离线回退。确保：

1. `endSession()` 调用 `/api/session/sync` 成功后，再将 summary 写回对应 session
2. `/api/session/sync` 将 messages 写入 `turns` 表、corrections 写入 `correction_items` 表

当前 `/api/session/sync` 实现需验证是否正确写入了 turns 和 correction_items。如果未写入，历史页的 turn detail 将永远为空。

> 检查 `apps/web/app/api/session/sync/route.ts` 的实现完整性。

### 2.3 实施顺序

1. **2.2.A（详情展开）**— 用户体验提升最大
2. **2.2.B（分页）**— 为大量数据做准备
3. **2.2.E（数据持久化验证）**— 确保 A 有数据可展示
4. **2.2.C（筛选）**
5. **2.2.D（删除）**

---

## 三、跨设备 Preferences 同步

### 3.1 当前数据流

```
Web Settings 页:
  TTS provider → fetch PATCH /api/preferences + localStorage
  TTS speed    → localStorage (meteorvoice-tts-speed) + fetch PATCH /api/preferences
  Default accent → localStorage (coach-default-accent) + fetch PATCH /api/preferences

Mobile 端:
  加载: GET /api/preferences → tts_provider + available_providers + tts_speed + locale + default_scenario/accent
  保存: fetch PATCH /api/preferences (仅 "Save setup" 按钮触发)

VoiceSessionProvider (Web):
  mount 时 GET /api/preferences → 恢复 ttsProvider + ttsSpeed
  ttsSpeed 也监听 localStorage 的 change event
```

### 3.2 核心问题

1. **Web 端双写但权威源不明确**：TTS speed 和 default accent 同时存 localStorage 和 Supabase，但 mount 恢复时优先读 localStorage，API 值可能被忽略
2. **Mobile 端不回写默认设置**：用户改 TTS speed 后需要手动点 "Save setup" 才能同步，离开页面后丢失
3. **跨设备实时感知为零**：设备 A 改 preferences 后，设备 B 需要刷新才能看到。对于"跨设备切换继续练习"的场景，这会让人困惑
4. **Settings 页的 default accent 只写 localStorage，没写 API**

### 3.3 改进方案

#### A. 统一权威数据源（优先级：高）

**规则：Supabase `theme_preferences` 是唯一权威源，localStorage 仅作离线/性能缓存。**

**实施步骤：**

1. **修改 `tts-speed.ts`**：`writeTTSSpeedPreference()` 增加 PATCH `/api/preferences` 调用，API 成功后再写 localStorage：

```typescript
export async function persistTTSSpeedPreference(speed: TTSSpeed) {
  if (typeof window === 'undefined') return
  // 先乐观更新本地
  localStorage.setItem(ttsSpeedStorageKey, String(speed))
  window.dispatchEvent(new CustomEvent(ttsSpeedChangeEvent, { detail: { speed } }))
  // 异步同步到服务端
  try {
    await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tts_speed: speed }),
    })
  } catch {
    // 静默失败，下次加载时从 API 恢复
  }
}
```

2. **修改 `readTTSSpeedPreference()`**：首次读取用 localStorage 值做乐观渲染，同时异步从 API 拉取最新值覆盖。API 值优先。

3. **修改 Settings 页**：`handleAccentChange()` 在写 localStorage 的同时 PATCH `/api/preferences`。

**涉及文件：**
- `apps/web/lib/tts-speed.ts`
- `apps/web/app/settings/page.tsx`

**验收：**
- 在设备 A 改 TTS speed → 设备 B 刷新页面 → 看到相同 speed
- 离线时改 speed → localStorage 更新 → 上线后下次 API 调用自动同步

#### B. Mobile 端偏好自动回写（优先级：高）

**问题：** Mobile `App.tsx` 中 `adjustSpeed()` 只调 `setTtsSpeed`（本地 React state），没有回写 API。`savePracticePreferences()` 存在但需手动触发。

**实施步骤：**

1. 在 `nativeAudio.ts` 同级新增 `mobilePreferences.ts`：

```typescript
// apps/mobile/src/mobilePreferences.ts
import { createMeteorVoiceApiClient } from '@meteorvoice/api-client'

export async function syncMobilePreferences(input: {
  apiBaseUrl: string
  getAuthHeaders: () => HeadersInit
  ttsProvider: string
  ttsSpeed: number
  defaultScenarioKey: string
  defaultAccentKey: string
}) {
  const api = createMeteorVoiceApiClient({
    baseUrl: input.apiBaseUrl,
    headers: input.getAuthHeaders,
  })
  await api.updatePreferences({
    tts_provider: input.ttsProvider,
    tts_speed: input.ttsSpeed,
    default_scenario_key: input.defaultScenarioKey,
    default_accent_key: input.defaultAccentKey,
  })
}
```

2. `adjustSpeed()` 改为 debounce 回写（500ms 延迟，避免每次拖滑块都请求）：

```typescript
const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

function adjustSpeed(delta: number) {
  setTtsSpeed(previous => {
    const next = Math.min(1.3, Math.max(0.7, Number((previous + delta).toFixed(1))))
    // Debounce sync to API
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      void syncMobilePreferences({ ... })
    }, 500)
    return next
  })
}
```

3. `saveProvider()` 和 `savePracticePreferences()` 可以保留为立即保存入口。

**涉及文件：**
- `apps/mobile/src/mobilePreferences.ts`（新建）
- `apps/mobile/src/App.tsx`

**验收：**
- 在 Mobile 调整 TTS speed → 等待 500ms → Web 刷新设置页 → 显示相同 speed
- 切换 TTS provider → 立即同步（已有的 `saveProvider` 逻辑）→ Web 同步

#### C. Supabase Realtime 订阅（优先级：中低）

当用户多设备同时在线时（如手机 + 电脑），preferences 变更可以实时推送。

**实施步骤：**

1. 在 `VoiceSessionProvider` 和 Mobile `App.tsx` 中订阅 Supabase Realtime channel：

```typescript
// Web 端
useEffect(() => {
  const supabase = createClient(url, anonKey)
  const channel = supabase
    .channel('preferences-changes')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'theme_preferences', filter: `user_id=eq.${userId}` },
      (payload) => {
        // payload.new 包含新值，更新本地状态
        setTtsProvider(payload.new.tts_provider)
        setTtsSpeed(normalizeTTSSpeed(payload.new.tts_speed))
      }
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}, [userId])
```

2. Mobile 端同理，或简化为每次 app 进入前台时主动 `GET /api/preferences`。

> **推荐先做 "app 进入前台主动拉取"**（Mobile 已有 `AppState.addEventListener('change')`），Realtime 可后续补齐。

**涉及文件：**
- `apps/web/components/VoiceSessionProvider.tsx`
- `apps/mobile/src/App.tsx`

**验收：**
- Web 端改偏好 → Mobile 进入前台 → 自动更新
- 或：Web 端改偏好 → Supabase Realtime 推送 → Mobile 无需刷新即更新

### 3.4 实施顺序

1. **3.3.A（统一权威源）**— Web 端改为 API 优先
2. **3.3.B（Mobile 自动回写）**— 补上 mobile 的同步缺口
3. **3.3.C（Realtime / 前台拉取）**— 实现跨设备实时感知

---

## 四、Mobile 音频硬化

### 4.1 当前实现

`apps/mobile/src/nativeAudio.ts`（233 行）：
- 基于 `expo-audio` 的 `useAudioPlayer` + `useAudioRecorder`
- 录音/播放互斥（`runExclusive` 模式）
- 前后台状态监听：app 后台时暂停播放、停止录音
- 权限：`requestRecordingPermissionsAsync()`
- 播放时先 stop 录音，切换 audio mode

### 4.2 缺口分析（对照 `docs/mobile-audio-qa-checklist.md`）

| QA 项 | 状态 | 说明 |
|-------|------|------|
| 基础播放 | 已实现 | `useAudioPlayer` + `playReply()` |
| 播放互斥 | 已实现 | `runExclusive` 保证单操作 |
| 后台暂停播放 | 已实现 | `AppState.addEventListener('change')` |
| 前台恢复播放 | 部分 | 只暂停了，未恢复 |
| 录音权限 deny | 已处理 | 显示 blocked/error |
| 录音/播放互斥 | 已实现 | 播放期间录音被 block |
| 快速点击互斥 | 已实现 | `runExclusive` |
| 后台停止录音 | 已实现 | 后台时 stop + paused |
| iOS 静音键 | **未实现** | 需要在 `setAudioModeAsync` 中配置 `playsInSilentMode: true`（已设），但未验证真机效果 |
| iOS Audio Interruption | **未实现** | 来电/闹钟等 interruption 未处理 |
| iOS Audio Route Change | **未实现** | 拔耳机/连蓝牙时的路由切换未处理 |
| Bluetooth 音频 | **未验证** | QA checklist 要求但未执行 |
| 耳机输出 | **未验证** | QA checklist 要求但未执行 |
| Earpiece 路由 | **未验证** | 需确认不会错误路由到听筒 |
| 并发录音操作 | 已实现 | `runExclusive` |
| 权限恢复 | **未实现** | 用户去系统设置改权限后回到 app 的检测 |

### 4.3 改进方案

#### A. iOS Audio Interruption 处理（优先级：高）

当来电、闹钟、FaceTime 等中断音频时，系统发送 interruption 通知。当前代码对此无感知。

**实施步骤：**

1. 在 `nativeAudio.ts` 中监听 `expo-audio` 的 interruption 事件（如 Expo Audio 模块支持），或通过 `react-native` 的 `NativeEventEmitter` 监听 `AVAudioSessionInterruptionNotification`。
2. Interruption 开始时：
   - 如果正在播放 → 暂停播放，记录 `wasPlayingBeforeInterruption = true`
   - 如果正在录音 → 停止录音，记录 `wasRecordingBeforeInterruption = true`
   - 设置 `phase = 'paused'`
3. Interruption 结束后（`AVAudioSessionInterruptionWasSuspendedKey` 为 false）：
   - `wasPlayingBeforeInterruption` 为 true → 自动恢复播放（或显示 "Tap to resume" 提示）
   - `wasRecordingBeforeInterruption` 为 true → 恢复录音 ready 状态

**涉及文件：**
- `apps/mobile/src/nativeAudio.ts`

**验收：**
- iOS 真机：会话中播放 coach 回复 → 来电 → 音频暂停 → 挂断 → 可继续播放
- 会话中录音 → 闹钟响 → 录音停止 → 关闭闹钟 → 可继续录音
- Android：audio focus 变化时同理

#### B. Audio Route Change 处理（优先级：高）

用户插拔耳机、连接/断开蓝牙音箱时，音频路由变化。当前代码不响应此事件。

**实施步骤：**

1. 监听音频路由变化事件。Expo Audio 可能通过 `expo-audio` 的 `AudioSession` API 暴露。
2. Route change 时：
   - 不中断当前播放/录音
   - 仅记录当前路由信息用于调试
   - 如果从蓝牙切到内置扬声器 → 考虑降低音量或暂停以保护隐私
3. 在 `setAudioModeAsync` 中确认：
   - `shouldRouteThroughEarpiece: false`（当前已设）确保播放走扬声器而非听筒
   - 蓝牙输出由系统自动处理，只需确认 `allowsRecording` 切换正确

**涉及文件：**
- `apps/mobile/src/nativeAudio.ts`

**验收：**
- 播放 coach 回复时连接蓝牙耳机 → 音频自动切到蓝牙
- 拔掉耳机 → 音频暂停（保护隐私）或提示
- 录音时插耳机 → 继续录音不受影响

#### C. Silent Mode 验证与双模式配置（优先级：中）

iOS 静音键可能在静音模式下不播放任何音频。

**实施步骤：**

1. `setAudioModeAsync` 中当前已设 `playsInSilentMode: true`——在真机上验证是否生效。
2. 如果仍不生效，检查 `app.json` 的 `UIBackgroundModes` 配置，确认 audio 权限声明正确。
3. 测试场景：静音键打开 → 播放 coach 回复 → 应听到声音。
4. 记录验证结果到 `docs/mobile-audio-qa-checklist.md`。

**涉及文件：**
- `apps/mobile/src/nativeAudio.ts`（可能的配置调整）
- `apps/mobile/app.json`（检查 `ios.infoPlist`）

**验收：**
- iOS 真机，静音键开启 → 播放 coach 回复 → 扬声器出声
- 代码无需大改动，记录验证结果即可

#### D. 权限状态恢复检测（优先级：中）

用户在系统设置中修改麦克风权限后回到 app，当前代码只在 `startRecording()` 时重新请求权限，不会主动检测权限变化。

**实施步骤：**

1. 在 `AppState` change 为 `'active'` 时，调用 `requestRecordingPermissionsAsync()` 检查当前权限状态（此 API 在已授权时不会弹窗，直接返回 `granted: true`）：

```typescript
useEffect(() => {
  const subscription = AppState.addEventListener('change', async (nextState) => {
    if (nextState === 'active') {
      const { granted } = await requestRecordingPermissionsAsync()
      setPermission(granted ? 'granted' : 'denied')
    }
  })
  return () => subscription.remove()
}, [])
```

2. 如果权限从 `denied` 变为 `granted`，清除之前的错误信息。

**涉及文件：**
- `apps/mobile/src/nativeAudio.ts`

**验收：**
- App 运行时去系统设置关闭麦克风权限 → 回到 app → 显示 denied 状态
- 再次去设置开启权限 → 回到 app → 恢复 granted 状态

#### E. 完整 QA Checklist 执行（优先级：中）

逐项跑 `docs/mobile-audio-qa-checklist.md`，更新执行记录。

**操作方式：**

1. 在 iOS simulator 上跑完 Playback + Recording + TTS Sentence Playback + Session Flow 所有项目
2. 在 iOS 真机 development build 上跑 Device Routes（蓝牙/耳机/扬声器/静音键）
3. 将结果填入 checklist 的 Execution Record Template
4. 失败的项建立独立 issue

**这不是代码改动，是手动 QA + 文档更新。**

### 4.4 实施顺序

1. **4.3.A（iOS Interruption）**— 影响用户真实使用场景的稳定性
2. **4.3.B（Route Change）**— 同上
3. **4.3.D（权限恢复检测）**— 改动小
4. **4.3.C（Silent Mode 验证）**— 主要是验证
5. **4.3.E（完整 QA）**— 系统性补测

---

## 用户决策记录（2026-05-24）

- **Session 删除方式**：软删除（status → 'deleted'），保留数据用于未来分析。
- **Preferences 同步失败处理**：静默失败，但记录失败状态；网络恢复后自动重试同步。
- **拔耳机行为**：暂停播放，保护隐私，防止周围人听到。
- **真机测试**：用户有真机，但开发者账号可用性待确认。代码先写，验收需等真机环境就绪。
- **EAS Build CI**：代码写好但注释不启用，等用户确认成本后再开启。

## 总体实施建议

四个方向相互独立，可以并行推进。建议的 issue 拆分：

| Issue | 方向 | 预估工作量 |
|-------|------|-----------|
| `[Feature] CI cache and parallel jobs` | CI/CD | 小（改 yml） |
| `[Feature] History session detail expansion` | 历史页 | 中（前端为主） |
| `[Feature] History pagination` | 历史页 | 中（前后端） |
| `[Feature] Unify preferences data source to Supabase` | Preferences | 中（前后端） |
| `[Feature] Mobile preferences auto-sync` | Preferences | 小（mobile 为主） |
| `[Fix] iOS audio interruption and route change handling` | Mobile 音频 | 中（mobile native） |
| `[Feature] Mobile audio permission recovery detection` | Mobile 音频 | 小（mobile） |
| `[Feature] Mobile audio QA pass` | Mobile 音频 | 手动 QA |

建议优先启动 CI 缓存（收益最快）和 Mobile 音频硬化（影响用户真实体验），历史页和 Preferences 可并行推进。

---

## 验收总览

完成后应满足：

```bash
# CI/CD
# - CI 运行时间 < 3 分钟（含缓存）
# - 4 个 job 并行，lint/packages-test/mobile-typecheck 独立反馈

# 历史页
# - 每张 session 卡片可展开查看 turns + corrections
# - "Load more" 分页正常
# - 删除功能可用

# Preferences
# - Web 改 TTS speed → API 同步 → Mobile 进入前台后自动更新
# - Mobile 改 TTS speed → debounce 回写 API → Web 刷新后同步
# - localStorage 仅作缓存，API 是权威源

# Mobile 音频
# - iOS 来电/闹钟 → 音频暂停 → 恢复后不 crash
# - 蓝牙/耳机连接切换 → 音频路由正确
# - 静音键不影响 coach 播放
# - 权限变更后回到 app 状态正确
```
