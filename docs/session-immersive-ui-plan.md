# 会话页沉浸式语音 UI 产品/工程计划

本计划用于落地 MeteorVoice 的会话页沉浸式语音体验。目标是让开发者和 AI agent 能直接按规则实现、拆分任务和验收。

## 目标

- 让 `/session` 成为专注的英语口语练习空间，减少导航和设置噪音。
- 保持用户对麦克风、AI speaking、paused、corrections 的状态感知。
- 将 Transcript 和 Corrections 组织成清晰的学习面板，不阻塞语音循环。
- 让语音交互遵守可测试的 STT/TTS 时序，避免自动自说自话。
- 保持中文/英文 UI 本地化一致，内部数据不暴露给用户。

## 非目标

- 不实现后台静默监听。
- 不做完整课程系统、社交功能或群聊。
- 不把 provider key、Supabase service role 或内部 ID 暴露到客户端。
- 不为了沉浸式 UI 重写整个 app shell。
- 不把 mock STT 当作 live session 用户输入。

## UI 布局原则

### 桌面布局

- `/session` SHOULD 使用三段式沉浸布局：
  - 左侧：轻量 session context，包括 scenario、accent、session status、退出/结束控制。
  - 中间：主对话舞台，突出当前状态、最近对话和主要语音控制。
  - 右侧：学习面板，使用 `Corrections` / `Transcript` tabs。
- 主对话舞台 MUST 始终可见，不应被 correction card、错误提示或说明文案挤走。
- 麦克风、暂停、继续、结束按钮 MUST 有稳定尺寸，状态变化不能造成布局跳动。
- 视觉层级 SHOULD 以当前练习状态为中心：listening、thinking、speaking、paused、ended。
- 禁止把说明性大段文字放在第一屏主舞台；用户进入会话后应直接练习。

### 移动布局

- 移动端 SHOULD 使用单列主舞台。
- `Corrections` / `Transcript` SHOULD 以 tabs 或 bottom panel 呈现，不得遮挡核心语音控制。
- 主要操作按钮 MUST 固定在易触达区域，并避免与浏览器底部安全区冲突。
- 文本 MUST 在窄屏内换行或缩放到合理尺寸，禁止溢出按钮、卡片或 tabs。

### 状态显示

- 当前 session 状态 MUST 明确显示，至少覆盖：ready、listening、transcribing、thinking、speaking、paused、ended、error。
- 录音中 MUST 有明确视觉指示；暂停监听时 MUST 与录音中有明显区别。
- TTS fallback、STT unavailable、permission denied MUST 使用用户可理解文案，不暴露 provider stack trace。

## Corrections / Transcript Tabs 设计

### Tabs 结构

- 右侧学习面板 MUST 提供两个主要 tabs：`Corrections` 和 `Transcript`。
- `Corrections` SHOULD 是默认 tab，除非当前没有 correction 且已有 transcript。
- Tabs 状态 SHOULD 在当前 session 内保持，不必跨完整浏览器重启持久化。

### Corrections Tab

- Corrections MUST 累积展示整个 session 的 correction items，而不是只显示最后一条。
- 每条 correction SHOULD 包含：
  - correction type，例如 grammar、pronunciation、word choice、fluency。
  - original text。
  - suggested text。
  - 简短 explanation。
  - severity 或优先级。
  - replay action，如果已有可播放音频。
- Corrections MUST 非阻塞；出现 correction 后，主对话舞台仍可继续下一轮。
- 严重 correction MAY 触发 live interruption，但必须保证不会打断正在播放的 TTS 造成重叠。
- 禁止用 correction 面板替代麦克风控制。

### Transcript Tab

- Transcript MUST 按时间顺序展示 user / assistant turns。
- 每条 turn SHOULD 显示 speaker、localized timestamp、transcript、可选 translatedText、可选 audio replay。
- Transcript SHOULD 支持滚动到最新 turn，但不能因为新消息导致用户正在阅读的 correction 丢失上下文。
- 禁止展示 session UUID、turn ID、raw provider response。

## 持续监听规则

- 持续监听只表示“每轮 TTS 结束后自动进入下一次真实用户输入等待”，不是后台录音。
- Active session 期间，只有当前路由为 `/session` 时 MAY 监听麦克风。
- 离开 `/session` 时 MUST 立即暂停 microphone listening，并显示 global paused indicator。
- 返回 `/session` 时，如果 session 仍 active，SHOULD 恢复同一会话的下一轮 listening。
- 用户结束 session 后 MUST 停止所有监听并清理 pending async work。
- Silence/no-speech MUST 不生成 synthetic user message。
- Browser STT 不可用时 MUST 显示明确错误或降级输入方案；禁止偷偷切到 mock STT 继续 live loop。

## TTS/STT 时序规则

### 单轮 turn 时序

1. `idle/listening`: 会话等待用户真实语音。
2. `transcribing`: STT 处理中，MUST 锁定当前 turn。
3. `thinking`: AI 生成回复和 corrections。
4. `speaking`: TTS 播放 AI 回复；此阶段 MUST 暂停 STT 输入。
5. `post-turn`: 保存 transcript/corrections，释放 turn lock。
6. 如果 session active 且仍在 `/session`，回到 `listening`。

### 并发保护

- MUST 使用 active turn guard 防止重复点击、重复 STT 回调或 route remount 触发多个 reply。
- TTS 播放开始前 SHOULD 取消或忽略当前 STT listener。
- TTS 播放结束后 SHOULD 明确恢复 listening，而不是依赖隐式状态。
- End session MUST cancel pending STT、AI request、TTS playback 和 correction replay。

### Provider 和 fallback

- TTS provider 选择 MUST 使用用户设置或 server-side default。
- Provider credentials MUST 只读取 server env。
- Provider 不支持某 accent 时，UI MUST 禁用该 accent 或显示明确不可用状态。
- Mock/browser TTS MAY 作为 fallback；fallback 状态 SHOULD 可见但不打断学习流程。

## 多语言要求

- UI 导航、状态、错误、tabs、按钮、scenario、accent、difficulty、provider label、correction type MUST 本地化。
- 英语练习内容和 transcript MAY 保持英语；解释说明 MAY 根据用户 locale 输出中文或英文。
- 新增可见文案 SHOULD 进入统一 i18n 资源或 helper，禁止散落硬编码。
- 日期、时间、状态和难度 SHOULD 使用 locale-aware formatter。
- 用户可见 UI 禁止出现内部 alias email、UUID、数据库字段名或 raw enum。

## 执行顺序

本需求 MUST 先落地计划文档，再拆分代码任务。禁止在阶段边界不清楚时让单个 agent 同时修改会话 UI、Web Audio、TTS/STT 时序和 docs。

推荐顺序：

1. 文档阶段：确认本文件的目标、非目标、阶段拆分、验收标准和 agent 分工。
2. Phase 1：实现状态驱动的沉浸式会话布局，不接入真实音频频谱。
3. Phase 2：接入用户麦克风音量驱动 listening waveform。
4. Phase 3：接入 AI 播放音频驱动 speaking waveform。
5. Phase 4：补齐字幕模式、可访问性、本地化和回归验证。
6. 文档整理阶段：代码阶段完成后，再整理 `docs/` 体系、实施记录和最终规则。

## 四阶段落地计划

### Phase 1: 状态驱动的沉浸式布局

目标：先把产品形态做出来，不碰真实 Web Audio 采集。

范围：

- 重构 `/session` 为“主语音舞台 + 右侧学习面板”的布局。
- 主舞台展示 scenario、accent、status、voice waveform、当前字幕、开始/结束/继续控制。
- waveform 根据 `snapshot.state`、`isSessionActive`、`isRoutePaused` 进入不同视觉状态：
  - `listening`: 麦克风等待状态，使用状态驱动的柔和波动。
  - `speaking`: AI 播放状态，使用不同节奏/颜色的波动。
  - `thinking/transcribing`: 使用低干扰处理中状态。
  - `idle/paused/ended`: 静止或低幅呼吸状态。
- 右侧学习面板提供 `Corrections` / `Transcript` tabs。
- `Corrections` 默认展示；`Transcript` 展示完整历史消息。
- 新增可见文案 MUST 写入 `lib/i18n.ts` 的 `en` 和 `zh`。

禁止项：

- 禁止在 Phase 1 接入真实麦克风频谱。
- 禁止改变 STT/TTS 核心 turn loop。
- 禁止删除已有 session persistence、return to practice、corrections replay。

推荐 agent：

- 1 个 UI agent 负责 `app/session/SessionPage.tsx` 和必要的 session 局部组件。
- 1 个 reviewer/main agent 负责集成、lint/test 和移动端检查。

### Phase 2: 用户麦克风实时音量 waveform

目标：用户说话时，waveform 由真实麦克风输入音量驱动。

范围：

- 使用 Web Audio API 从已授权麦克风流读取音量或频谱。
- 只在 `/session` active listening 状态启用 analyser。
- 离开 `/session`、暂停、结束 session 时 MUST 停止 analyser 和 media tracks。
- 不能因为 waveform 采集新建第二套麦克风权限流程。
- 浏览器不支持或权限不足时 MUST 回退到 Phase 1 的状态驱动波形。

禁止项：

- 禁止后台采集麦克风。
- 禁止 waveform analyser 影响 STT turn guard。
- 禁止把音频原始数据发送到服务端。

推荐 agent：

- 1 个 audio agent 负责 Web Audio hook/component。
- 1 个 integration agent 负责和现有 `VoiceSessionProvider` 的状态衔接。

### Phase 3: AI 播放音频 waveform

目标：AI speaking 状态下，waveform 尽量由真实 TTS playback 音频驱动。

范围：

- 对真实 TTS audioUrl 播放链路评估是否能接入 `AudioContext` analyser。
- 保持现有“必须等 TTS 播放结束再恢复 STT”的规则。
- 如果 provider audio 受跨域、浏览器 autoplay 或 AudioContext 限制，MUST 回退到 Phase 1 的 speaking 动效。
- mock/browser TTS 可以继续使用状态驱动 speaking 动效，不强制读取系统 speechSynthesis 音频。

禁止项：

- 禁止为了 waveform 破坏 TTS 播放结束等待。
- 禁止同时播放多个 AI 音频。
- 禁止在播放失败时静默进入下一轮 listening。

推荐 agent：

- 1 个 TTS/audio agent 负责播放链路和 fallback。
- 1 个 QA agent 负责回归“AI 不自说自话”的手动验收。

### Phase 4: 字幕模式、体验打磨和回归验证

目标：把沉浸式体验打磨成可长期练习的界面，而不是一次性视觉 demo。

范围：

- 主舞台只展示当前用户字幕和当前 AI 字幕。
- 完整历史消息只放在 `Transcript` tab。
- 当前字幕 SHOULD 自动更新，但不能遮挡语音控制。
- 移动端 tabs、按钮、字幕、summary、status 都必须不溢出。
- 补齐 aria label、键盘可达性、中文/英文文案。
- 增加或更新回归测试；至少手动验证桌面和移动宽度。

禁止项：

- 禁止把全部历史消息做成持续上滚的常驻字幕流。
- 禁止让 Corrections 和 Transcript 同时常驻占用右侧空间。
- 禁止为了视觉效果削弱会话状态可读性。

推荐 agent：

- 1 个 UI polish agent 负责字幕和移动端。
- 1 个 docs/reviewer agent 在代码完成后整理最终文档、变更记录和后续计划。

## 多 agent 分工规则

- 一个 agent SHOULD 只负责一个阶段或一个明确文件范围。
- Phase 1 和文档规划可以并行阅读，但代码落地必须以本文件为准。
- Phase 2 依赖 Phase 1 的 waveform 组件边界，不能提前改同一批 UI 文件。
- Phase 3 依赖现有 TTS 播放时序，不能和改 TTS turn loop 的任务并行写同一文件。
- Phase 4 依赖 Phase 1 的布局和 tabs，不能在 Phase 1 未稳定前做大范围 polish。
- docs 体系整理 SHOULD 放在代码阶段完成后，除非当前任务明确是“先整理文档”。

## 推荐任务拆分

### Task A: 文档计划确认

- 写清本文件。
- 确认 Phase 1-4 范围、禁止项、验收标准。
- 不改业务代码。

### Task B: Phase 1 UI

- 改 `/session` 布局、状态驱动 waveform、Corrections/Transcript tabs、当前字幕。
- 不接真实 Web Audio。

### Task C: Phase 2 Mic Waveform

- 添加麦克风音量 analyser。
- 和 route-aware pause/resume 对齐。

### Task D: Phase 3 Playback Waveform

- 评估并实现 AI playback analyser 或 fallback。
- 保持 TTS 完播后再监听。

### Task E: Phase 4 Polish & Regression

- 补字幕体验、移动端、a11y、本地化和测试。

### Task F: Docs Consolidation

- 在代码完成后整理 `docs/index.md`、`development-rules.md`、实施记录和后续计划。
- 把已完成/未完成阶段标注清楚。

## 验收标准

- `/session` 首屏能直接开始或继续语音练习。
- Corrections 和 Transcript 通过 tabs 清晰切换，且不会阻塞主语音控制。
- 用户说一句，AI 只回复一次；AI 说完后等待下一句真实用户输入。
- 用户沉默时，系统不会自动生成用户消息。
- TTS 播放期间，STT 不会把 AI 声音识别成用户输入。
- 离开 `/session` 后麦克风暂停；返回后同一 active session 可继续。
- 中文和英文 UI 都无明显硬编码遗漏，主要状态和错误可读。
- 不显示内部 ID、内部邮箱别名、raw provider payload。
- `npm run build` 和可用测试通过，或明确记录无法运行的原因。

## 推荐 PR 拆分

1. `[Feature] Add immersive session layout`
2. `[Feature] Add corrections and transcript tabs`
3. `[Fix] Guard STT and TTS turn timing`
4. `[Feature] Pause and resume listening by route`
5. `[Fix] Complete session UI localization`
6. `[Test] Add session loop regression coverage`

## 相关文档

- `docs/development-rules.md`
- `docs/product-optimization-plan.md`
- `docs/persistent-session-localization-plan.md`
- `docs/tts-integration.md`
- `docs/project-structure.md`
