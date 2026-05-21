# 移动端沉浸式会话舞台与 iOS 音频播放方案

状态：已完成并合入 `main`。本文档作为 mobile Web 布局和 iOS Web audio fallback 的历史计划保留；它不是 native mobile 长期架构入口。

本文档用于后续重构 `/session` 的移动端体验，并解决 iOS 浏览器上 AI 回复语音播放不稳定的问题。

## 背景问题

当前会话页在桌面端可用，但移动端存在明显体验问题：

- 主舞台被 Corrections / Transcript 面板挤压，真正用于说话、字幕和 waveform 的区域过小。
- 用户发言、AI 回复、声波和学习面板同时堆在第一屏，信息层级混乱。
- Corrections / Transcript 在移动端常驻占据大量高度，导致核心练习体验退化。
- iOS 浏览器中 AI 回复语音可能不播放；即使使用 Chrome on iOS，也仍然受 iOS/WebKit 媒体播放限制影响。

本方案目标是把移动端 `/session` 改成“全屏语音舞台 + 轻量学习抽屉”，同时补齐 iOS 音频播放解锁和失败恢复。

## 目标

- 移动端默认第一屏只突出语音练习，不让学习内容常驻挤压主舞台。
- Waveform、说话人状态、当前 AI 字幕和当前用户字幕成为核心视觉层级。
- Corrections / Transcript 变为按需打开的 bottom sheet，不遮挡主语音控制。
- iOS 上 AI 回复语音尽量自动接续播放；无法自动播放时，必须给出明确的点按播放恢复路径。
- 保持现有 STT/TTS turn loop：用户真实输入 -> AI 回复 -> TTS 播放完成 -> 下一轮 listening。

## 非目标

- 不重写整个 app shell。
- 不把完整聊天流重新放回主舞台。
- 不后台播放或后台监听。
- 不绕过浏览器权限策略。
- 不用 mock/generated STT 伪造 live session 输入。

## 移动端新布局

移动端 `/session` 使用全屏语音舞台：

```text
┌──────────────────────────────┐
│ 场景 / 口音 / 状态       结束 │
│                              │
│                              │
│              M               │
│        ~ ~ ~ ~ ~ ~ ~         │
│                              │
│        AI 当前回复字幕        │
│                              │
│        你的当前发言字幕       │
│                              │
│                              │
│          麦克风 / 继续        │
│  纠错 2              Transcript│
└──────────────────────────────┘
```

### 主舞台

- 使用 `100dvh` 或等价 viewport 约束，避免 iOS Safari 地址栏变化导致布局被压扁。
- 主舞台最小高度必须优先保障 waveform 和字幕，不让 bottom sheet 常驻占位。
- 中央显示一个大字符或轻量 avatar，例如 `M`、场景 icon 或 coach initials。
- Waveform 位于中央字符下方或围绕中央字符，宽度约为屏幕 70%-85%，高度约 80-120px。
- `listening`、`speaking`、`thinking`、`paused` 使用不同节奏和颜色，但保持克制。

### 字幕

字幕不再使用边框卡片，而是直接浮在背景中：

- AI 当前回复：主字幕，建议 18-22px，居中，最多 3-4 行。
- 用户当前发言：次字幕，建议 14-16px，放在 AI 字幕下方或上方，透明度更低。
- 长文本需要渐进截断或滚动展开，不能压缩 waveform。
- 完整历史只进入 Transcript bottom sheet。

### 主操作

- Start / Continue / End 维持稳定尺寸，避免状态变化造成布局跳动。
- 麦克风或继续按钮固定在底部安全区上方。
- iOS 播放失败时，在同一主操作区域显示 `Tap to play reply`，不能只在日志中失败。

## Corrections / Transcript Bottom Sheet

移动端不再常驻显示 Corrections / Transcript。

默认状态：

- 底部只显示两个入口：`Corrections` badge 和 `Transcript`。
- 有新纠错时显示数量或轻量提示，例如 `Corrections 2`。
- 不自动展开 Corrections，避免打断语音循环。

打开状态：

- 使用 bottom sheet，高度默认 45%-55%。
- 可上拉到约 80%，可下滑关闭。
- Sheet 内部保持 tabs：Corrections / Transcript。
- Sheet 打开时，主舞台仍保留可见顶部状态和关闭能力。
- Transcript 滚动不应影响主舞台状态。

桌面端可以继续使用右侧学习面板，但移动端必须切换为 bottom sheet。

## iOS 音频播放根因

iOS 上 Safari 和 Chrome 都可能出现 AI 回复不播放，因为 Chrome on iOS 仍受 iOS/WebKit 媒体策略影响。Apple 的 Safari/WebKit 文档说明，带音频的媒体播放通常需要用户手势；无音频或 muted 的视频 autoplay 条件更宽，但 audible audio 不能依赖自动播放。Apple 也明确提到 Safari on iOS 中嵌入媒体不能自动播放，用户需要发起播放。

参考：

- Apple Safari video/audio delivery 文档：`https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari`
- Apple Safari HTML5 Audio and Video Guide：`https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/AudioandVideoTagBasics/AudioandVideoTagBasics.html`
- Apple Developer Forums 中也有相关讨论：用户授权 camera/mic prompt 不一定等同于可用于播放音频的 user gesture。

因此，仅靠 `new Audio(audioUrl).play()` 在 AI 回复时自动播放，在 iOS 上不可靠。

## iOS 音频播放目标架构

为保证流畅，播放链路需要从“每次回复临时 new Audio”改成“会话级播放器”。

### 1. 用户手势解锁播放器

在用户点击 `Start Session` 或 `Continue` 的同一个同步事件链中：

- 创建或复用一个全局/session-level `HTMLAudioElement`。
- 调用一次短静音音频或空白音频播放，完成 media element unlock。
- 创建并 `resume()` session-level `AudioContext`，用于后续 analyser。
- 记录 `audioUnlocked: true | false`。

注意：unlock 必须发生在真实点击事件内，不能放到异步网络请求完成后再做。

### 2. 复用同一个 audio element

后续 AI 回复播放：

- 不再每次 `new Audio(audioUrl)`。
- 使用同一个 `audioRef.current`：
  - `audio.src = audioUrl`
  - `audio.load()`
  - `await audio.play()`
- Speaking waveform analyser 连接到这个固定 media element。

这样更符合 iOS 对 media element 的用户激活模型，也便于统一处理播放失败。

### 3. 明确播放失败恢复

如果 `audio.play()` reject：

- 不要静默 fallback 到无声。
- 设置状态为 `playback_blocked` 或等价 UI 状态。
- 主舞台显示 `Tap to play reply`。
- 用户点按后复用同一个 audio element 重新播放当前回复。
- 播放成功后再继续 post-turn 逻辑。

### 4. 保持 turn loop

iOS 播放修复不能破坏原有时序：

1. STT 获取真实用户输入。
2. AI 生成回复。
3. TTS 返回 audioUrl。
4. 尝试播放。
5. 如果被 iOS 阻止，等待用户点按播放。
6. 播放完成后，才进入下一轮 listening。

禁止在播放失败时直接进入下一轮 listening，否则会出现 AI 回复没播完甚至没播出，系统又开始监听用户的情况。

## 工程拆分建议

### PR 1：移动端全屏语音舞台

范围：

- 重构 `app/session/SessionPage.tsx` 的移动端布局。
- 移动端 Corrections / Transcript 改 bottom sheet。
- 字幕去卡片化，浮在主舞台背景中。
- 保持桌面端右侧面板布局。

验收：

- iPhone 宽度下 waveform 和字幕占据主视觉区域。
- Corrections / Transcript 默认不挤压主舞台。
- Start / Continue / End 不被 sheet 或安全区遮挡。

### PR 2：iOS 播放器解锁与复用

范围：

- 在 `VoiceSessionProvider` 中增加 session-level audio element。
- Start / Continue 点击链路中执行 audio unlock。
- TTS 播放复用同一个 audio element。
- 播放失败时暴露可恢复状态和 `playBlockedReply()`。

验收：

- iOS Safari 和 Chrome on iOS 中，点击 Start 后 AI 回复能播放。
- 如果播放被阻止，页面显示点按恢复按钮。
- 用户点按恢复后，当前回复播放完成，再进入下一轮 listening。

### PR 3：speaking waveform analyser 适配新播放器

范围：

- 将 speaking analyser 绑定到 session-level audio element。
- iOS/WebKit 不允许 analyser 或 AudioContext 未激活时，回退状态驱动 waveform。
- 清理 AudioContext、animation frame 和 media source lifecycle。

验收：

- 支持真实 audioUrl 时 speaking waveform 能随播放音量变化。
- 不支持时仍有 speaking 状态动画。
- 不影响 TTS 完播后再 listening。

## 风险与注意事项

- iOS 的 user activation 具有时效性，不能指望异步 TTS 返回后首次调用 `play()` 一定成功。
- `getUserMedia` 权限提示不应被当作播放解锁手势。
- iOS 低电量模式、静音开关、系统音量、蓝牙输出、听筒/扬声器路由都可能影响听感。
- Web Audio analyser 不应成为播放成功的前置条件。
- Chrome on iOS 不应作为规避 Safari 策略的方案。

## 推荐下一步

优先做 PR 1，因为它直接解决用户可见的移动端布局问题。随后做 PR 2，解决 iOS 语音播放可靠性。PR 3 可以建立在 PR 2 的 session-level audio element 上，避免现在的 analyser 和播放链路重复改造。
