# Runtime State, Feedback, and Settings Sync

本文档说明当前 Web 和 Mobile 共享的运行时 UI 反馈、聚合异步任务、设置同步和会话语言路由。修改设置页、历史页、登录后刷新、语音会话语言行为或全局 loading/error 展示前 MUST 阅读。

## 目标

运行时状态需要满足四个约束：

1. 页面进入、登录后、前后台恢复、手动刷新可以做全量 grouped refresh。
2. 单个设置项保存成功后 MUST 使用服务端返回的 preferences 做局部应用，不要再全量 reload 整个设置页。
3. 多接口刷新 MUST 通过共享 operation group 聚合 loading，避免多个 overlay 叠加、页面抖动或重复请求循环。
4. 会话回复语言由 UI locale 决定，ASR 识别语言独立配置，二者不要互相替代。

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `packages/shared/src/feedback.ts` | App 级反馈状态、source registry、展示类型和错误反馈桥接。 |
| `packages/shared/src/operation-group.ts` | 多个异步任务并发执行、统一展示/隐藏 loading。 |
| `apps/mobile/src/components/AppFeedbackOverlay.tsx` | Mobile 反馈/阻断层渲染。 |
| `apps/web/components/AppFeedbackPresenter.tsx` | Web 反馈/阻断层渲染。 |
| `apps/mobile/src/mobilePreferences.ts` | Mobile 设置静默同步，成功时返回服务端 preferences。 |
| `apps/mobile/src/App.tsx` | Mobile 设置全量刷新、局部应用、会话 `responseLocale` 传递。 |
| `apps/web/app/settings/page.tsx` | Web 设置全量刷新、局部应用和保存逻辑。 |
| `packages/shared/src/conversation.ts` | `ConversationContext.responseLocale` 契约。 |
| `apps/web/lib/server/chat.ts` | AI 回复、纠错和中英混合提示按 `responseLocale` 生成。 |

## App Feedback

`packages/shared/src/feedback.ts` 是平台无关的单例式反馈 registry。调用方只传参数，不直接操作 Web/Mobile 组件。

核心类型：

```ts
type AppFeedbackPresentation =
  | 'inline'
  | 'toast'
  | 'alert'
  | 'banner'
  | 'sheet'
  | 'blocking'
  | 'silent'

type AppFeedbackVariant = 'hud' | 'panel' | 'bar'
type AppFeedbackSeverity = 'info' | 'warning' | 'error'
```

规则：

- `presentation` 是调用方语义，表示希望如何展示。
- `variant` 是平台渲染形态，当前由 shared 层映射：
  - `banner` -> `bar`
  - `alert` / `sheet` -> `panel`
  - 其他可展示形态 -> `hud`
- `source` 是并发隔离 key。不同页面或任务 MUST 使用不同 source，例如 `settings-refresh`、`history-load`。
- `showAppFeedback()` 只更新当前 source 的反馈。
- `hideAppFeedback(source)` 只关闭该 source；不传 source 会清空全部反馈。
- registry 会发布最后一次 active source，避免多个 loading overlay 叠加。

调用示例：

```ts
showAppFeedback({
  source: 'settings-refresh',
  message: 'Loading settings...',
  presentation: 'blocking',
  blocksInteraction: true,
})
```

Web 和 Mobile 的 UI presenter 只订阅 `appFeedback.subscribe()` 并渲染当前 active feedback。新增页面不要自己写独立全屏 loading registry，应该复用 shared feedback。

## Operation Group

`runAppOperationGroup()` 用来表达“多个接口并发请求，UI 上只显示一个 loading，等全部 settled 后再隐藏”。

函数位置：

```ts
import { runAppOperationGroup } from '@meteorvoice/shared'
```

契约：

```ts
const results = await runAppOperationGroup({
  source: 'settings-refresh',
  feedback: {
    message: tr('session.status.preferences_loading'),
    presentation: 'blocking',
    blocksInteraction: true,
  },
  tasks: {
    preferences: () => api.getPreferences(),
    asrProviders: () => api.listASRProviders(),
  },
})
```

实现规则：

- 所有 tasks 并发执行，内部使用 `Promise.allSettled()`。
- 返回值按 task key 保留 fulfilled/rejected 状态。
- 调用方 MUST 显式处理每个关键 task 的失败。
- `finally` 中隐藏同一个 source 的反馈，避免 loading 卡死。
- 不要在一个页面里为每个接口分别 show blocking loading；页面级刷新应统一成一个 operation group。

适用场景：

- Settings 首次加载、登录成功后加载、前台恢复加载、手动刷新。
- History 列表加载、分页、删除后的列表刷新。
- 以后 Home/Session 配置化接口如果需要多接口并发，也应复用该能力。

不适用场景：

- 单个设置项 PATCH 保存后的局部 UI 应用。
- 会话中的 STT/AI/TTS 实时状态；这些状态由 session runtime 自己控制。

## Settings Sync

设置页分两类刷新路径。

### 全量 Grouped Refresh

只在这些场景使用：

- 页面首次进入。
- 登录成功后。
- App 从后台回前台。
- 用户手动点击刷新。
- 未来服务端结构变更后需要重建整页缓存。

全量 refresh 可以读取：

- `/api/preferences`
- `/api/asr/providers`
- 未来的 settings 相关配置接口

它应该通过 `runAppOperationGroup()` 聚合 loading，所有关键数据完成后再一次性 apply，减少页面高度变化和重复渲染。

### 局部 Preference Update

单项保存逻辑必须走：

```text
PATCH /api/preferences -> 返回 updated preferences -> apply affected fields only
```

禁止流程：

```text
PATCH /api/preferences -> GET /api/preferences -> apply whole settings page
```

原因：

- PATCH 失败时，立即 GET 只会读回旧数据，用户会看到状态闪回。
- PATCH 成功后全量 reload 会把整个设置页重新铺一遍，体验差且容易造成 loading 抖动。
- 服务端 PATCH 返回值已经是权威结果，客户端应该只应用本次 body 影响的设置域。

Mobile 当前局部应用函数：

- `applyTtsPreferences(preferences)`
- `applyPracticePreferences(preferences)`
- `applyVoiceProfilePreferences(preferences)`

Web 当前局部应用函数：

- `applyPreferenceUpdate(data, body)`

新增设置项时 MUST 明确它属于哪个域：

| 设置域 | 请求字段 | 成功后应用 |
| --- | --- | --- |
| TTS provider/speed | `tts_provider`, `tts_speed` | provider、speed、voice id、必要的 voice profile。 |
| Practice defaults | `default_scenario_key` | 默认 scenario；不要重置无关 TTS 列表。 |
| Voice profile | `selected_voice_profile_id` | selected profile、accent、provider、voice id。 |
| Theme/locale | `ui_theme`, future locale field | 只更新本地显示和必要持久化。 |

## Response Language

AI 回复语言和 ASR 识别语言是两条链路。

### AI 回复语言

Web 和 Mobile 调用 chat 时传：

```ts
responseLocale: locale
```

服务端契约：

- 类型：`ConversationContext.responseLocale?: 'en' | 'zh'`
- 默认：缺省或非法值按 `en`
- 作用范围：
  - coach reply 文本
  - corrections explanation
  - common correction supplement
  - mixed Chinese spoken hint

也就是说，用户在 UI 中切到中文时，AI 教练回复和纠错解释应优先用中文；切到英文时应使用英文。

### ASR 识别语言

ASR 负责把用户语音转文本，不决定 AI 回复语言。

当前 Xunfei 诊断路径：

- `/api/asr/session` 使用 `languageMode: "mixed_zh_en"`。
- `apps/web/lib/providers/xunfei-asr.ts` 将非英文请求归一到 `mixed_zh_en`。
- Xunfei provider config 使用 `language: "zh_cn"`、`accent: "mandarin"`、`domain: "slm"`。

这意味着当前远端 ASR 优先服务中文和中英混合识别。后续如果要根据 UI locale 动态切 `mandarin` / `mixed_zh_en` / `english`，必须只影响 ASR session config，不要移除 `responseLocale`。

## Regression Checklist

修改相关代码后至少验证：

```bash
npm run lint
npm --workspace @meteorvoice/mobile run typecheck
npm test
```

手工检查：

1. 登录后 Settings 数据能自动加载，loading 只出现一次。
2. 点击 TTS provider、语速、voice profile 后，状态不闪回、不整页抖动。
3. PATCH 失败时显示错误，不再立即读回旧数据覆盖用户感知。
4. 切 tab 后 loading 不残留，也不叠加变深。
5. UI 切中文后 AI 回复和纠错解释为中文；切英文后为英文。
6. ASR 诊断仍能使用 `mixed_zh_en` 识别中英混合句子。
