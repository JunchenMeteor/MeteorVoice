# Mobile Voice Stability Plan

Status: active planning document.

本文档定义 MeteorVoice Mobile 语音闭环稳定性优化的分阶段执行方案。当前目标不是一次性追平豆包电话体验，而是在不引入语音网关服务器的前提下，先把 native mobile 的自回声、状态卡死和真实设备差异压到可控范围。

## 背景

当前 Mobile 语音链路是：

```text
expo-speech-recognition final transcript
-> Mobile App.tsx 状态机
-> /api/chat
-> /api/tts
-> expo-audio 播放完整 TTS
-> 播放结束后重新启动 speech recognition
```

这条链路的核心风险是播放和监听之间的状态边界：

- TTS 播放期间，STT 可能收到 AI 自己的声音。
- 播放结束后的 cooldown 依赖 React effect 和 timer，容易被 state 更新打断。
- Expo 层没有跨平台的 `aec: true` 开关，不能只靠配置解决自回声。
- iOS、Android、外放、耳机、蓝牙、前后台切换的表现不同，必须通过真机 QA 收口。

## 当前架构能否写原生代码

可以。

当前项目是 Expo React Native native app，不是 WebView，也不是只能跑 Expo Go 的纯 JS app：

- Mobile app 位于 `apps/mobile`。
- iOS native project 已存在：`apps/mobile/ios`。
- `apps/mobile/package.json` 使用 `expo run:ios` / `expo run:android`。
- `apps/mobile/app.json` 已配置 `expo-audio`、`expo-speech-recognition` config plugins。

按 Expo 官方文档，项目可以通过 development build、prebuild 和自定义 native code 扩展原生能力。也就是说，后续可以继续保留 Expo 架构，同时新增 native module 或修改 iOS/Android 原生层；不需要立刻迁移成完全 bare React Native。

参考：

- Expo custom native code: https://docs.expo.dev/workflow/customizing/
- Expo prebuild / CNG: https://docs.expo.dev/workflow/prebuild/

## Expo 中 AEC 能做到什么

当前 `expo-audio` 暴露的稳定配置包括：

- `setAudioModeAsync`
- `allowsRecording`
- `interruptionMode`
- `playsInSilentMode`
- `shouldPlayInBackground`
- `shouldRouteThroughEarpiece`
- Android `RecordingSource`

其中 Android `RecordingSource.voice_communication` 的说明是：面向 VoIP 场景，系统可在可用时利用 echo cancellation 或 automatic gain control。

但现状是：

- `expo-audio` 没有跨平台 `aec: true` 配置。
- iOS 没有通过 Expo API 直接暴露 `AVAudioSessionModeVoiceChat` / `AVAudioSessionModeVideoChat` 这类更明确的语音通话模式。
- Android 可以尝试 `voice_communication`，但当前主路径使用 `expo-speech-recognition`，不是 `expo-audio` recorder 上传音频，所以它不能直接改变 speech recognition 的采集链路。

结论：

- 短期不能把 AEC 当成主修复。
- 可以先验证 Expo 已有音频模式是否改善外放回声。
- 真要做强 AEC，需要 native 层方案，尤其是 iOS `AVAudioSession` mode 和 Android `AcousticEchoCanceler` / voice communication source 的可控接入。

参考：

- Expo Audio: https://docs.expo.dev/versions/latest/sdk/audio/
- Expo Audio `RecordingSource.voice_communication`: https://docs.expo.dev/versions/v54.0.0/sdk/audio/

## 分阶段执行方案

### Phase 0: 修复播放后不恢复监听

目标：先解决 AI 回复播放完后状态卡住、不能继续监听的问题。

问题定位：

- `apps/mobile/src/App.tsx` 中播放完成 effect 依赖 `audio.didJustFinish`、`audioUrl`、`playbackQueue`。
- 播放完成后调用 `setPlaybackQueue(nextQueue)` 会触发 effect cleanup。
- 原本 900ms 后恢复监听的 `setTimeout` 绑定在该 effect 闭包内。
- cleanup 会把闭包里的 `cancelled` 置为 true，导致 900ms timer 到点后直接 return。

执行方案：

1. 在 `AppInner` 增加独立 timer ref：

```ts
const resumeListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

2. 新增清理函数，放在 `tr` 定义之后、`startSession` 之前：

```ts
const clearResumeListeningTimer = useCallback(() => {
  if (!resumeListeningTimerRef.current) return
  clearTimeout(resumeListeningTimerRef.current)
  resumeListeningTimerRef.current = null
}, [])
```

3. 新增恢复监听调度函数：

```ts
const scheduleResumeListening = useCallback((delayMs = 900, updateStatus = true) => {
  clearResumeListeningTimer()
  resumeListeningTimerRef.current = setTimeout(() => {
    resumeListeningTimerRef.current = null
    if (!sessionActiveRef.current || !canListenOnRouteRef.current || playbackActiveRef.current) return
    listeningStartMsRef.current = Date.now()
    if (updateStatus) setStatus('session.status.listening')
    void speechStartListeningRef.current('en-US')
  }, delayMs)
}, [clearResumeListeningTimer])
```

参数说明：

| 参数 | 类型 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `delayMs` | `number` | `900` | 播放结束后的 cooldown。 |
| `updateStatus` | `boolean` | `true` | 是否在 timer 到点时把 UI status 改为 listening。correction 播放结束时可能已提前设置为 listening，因此传 `false`。 |

4. 增加 unmount cleanup：

```ts
useEffect(() => clearResumeListeningTimer, [clearResumeListeningTimer])
```

5. 播放完成时不再直接创建依赖 effect 闭包的 900ms timer，而是调用 `scheduleResumeListening()`。
6. 以下场景必须清理恢复监听 timer：
   - 新 session 开始。
   - 用户转写被提交。
   - 新 TTS 播放开始。
   - correction TTS 播放开始。
   - session 结束。
   - app 切后台。
   - 播放队列切到下一段音频。

涉及文件：

- `apps/mobile/src/App.tsx`

精确改动点：

| 位置 | 改法 |
| --- | --- |
| `startSession()` 开头 | 调用 `clearResumeListeningTimer()`。 |
| playback completion effect 的 correction 分支 | 用 `scheduleResumeListening(900, false)` 替换闭包内 `setTimeout`。 |
| playback completion effect 的主回复完成分支 | 用 `scheduleResumeListening()` 替换闭包内 `setTimeout`。 |
| playback completion effect 的 `play_next_audio` 分支 | 在播放下一段前调用 `clearResumeListeningTimer()`。 |
| `submitTurn()` 接受用户转写后 | 在 `speechCancelListeningRef.current()` 前调用 `clearResumeListeningTimer()`。 |
| `voice.audioUrl` 播放分支 | 在设置 `playbackActiveRef.current = true` 后调用 `clearResumeListeningTimer()`。 |
| `endSession()` | 设置 `playbackActiveRef.current = false` 后调用 `clearResumeListeningTimer()`。 |
| `AppState` 进入后台分支 | 设置 `canListenOnRouteRef.current = false` 后调用 `clearResumeListeningTimer()`。 |
| `playCorrection()` | 播放 correction 语音前调用 `clearResumeListeningTimer()`。 |

依赖数组要求：

- playback completion effect 依赖数组加入 `clearResumeListeningTimer` 和 `scheduleResumeListening`。
- `submitTurn` 的 `useCallback` 依赖数组加入 `clearResumeListeningTimer`。
- `AppState` effect 依赖数组加入 `clearResumeListeningTimer`。

验收标准：

- AI 回复播放完成后，状态在 cooldown 后回到 `session.status.listening`。
- STT 能再次启动并接受下一轮用户输入。
- 播放期间不会提前恢复监听。
- 切后台、结束 session、切换到下一段音频时，不会有旧 timer 把监听重新拉起来。

验证命令：

```bash
npm --workspace @meteorvoice/mobile run typecheck
```

真机验证：

- 外放播放一轮 AI 回复，等待播放结束，确认自动恢复监听。
- 播放过程中切后台，回前台后不出现旧 timer 误启动。
- 播放 correction 音频后能恢复原 session 监听。

### Phase 1: 状态门控收紧

目标：降低自说自话，不引入原生代码，不改服务端。

执行方案：

#### 1.1 新增本地语音门控 helper

建议在 `packages/session-core/src/workflow.ts` 新增纯函数，避免 Mobile 内联散落规则：

```ts
export interface UserTranscriptGateInput {
  activeSession: boolean
  canListenOnRoute: boolean
  workflowState: WorkflowState
  transcript?: string | null
  playbackActive: boolean
  audioPlaying: boolean
  nowMs?: number
  playbackEndedAtMs?: number | null
  cooldownMs?: number
}

export type UserTranscriptGateReason =
  | 'accepted'
  | 'empty_transcript'
  | 'inactive_session'
  | 'route_blocked'
  | 'playback_active'
  | 'cooldown_active'
  | 'workflow_not_ready'

export interface UserTranscriptGateResult {
  accepted: boolean
  reason: UserTranscriptGateReason
}

export function gateUserTranscript(input: UserTranscriptGateInput): UserTranscriptGateResult
```

函数规则必须固定如下：

```text
1. transcript trim 后为空 -> empty_transcript
2. activeSession false -> inactive_session
3. canListenOnRoute false -> route_blocked
4. playbackActive true 或 audioPlaying true -> playback_active
5. playbackEndedAtMs 存在，且 nowMs - playbackEndedAtMs < cooldownMs -> cooldown_active
6. workflowState 不在 listening/idle/correcting -> workflow_not_ready
7. 其他 -> accepted
```

默认值：

```ts
const DEFAULT_PLAYBACK_COOLDOWN_MS = 900
```

#### 1.2 Mobile 接入点

在 `apps/mobile/src/App.tsx` 中新增：

```ts
const playbackEndedAtMsRef = useRef<number | null>(null)
```

更新时机：

| 时机 | 值 |
| --- | --- |
| 开始播放 TTS | `playbackEndedAtMsRef.current = null` |
| 播放完整结束 | `playbackEndedAtMsRef.current = Date.now()` |
| correction 播放结束 | `playbackEndedAtMsRef.current = Date.now()` |
| 开始 session | `playbackEndedAtMsRef.current = null` |
| 结束 session | `playbackEndedAtMsRef.current = null` |

在 `handleNativeFinalTranscript()` 开头替换当前散落判断：

```ts
const gate = gateUserTranscript({
  activeSession: sessionActiveRef.current,
  canListenOnRoute: canListenOnRouteRef.current,
  workflowState: snapshot.state,
  transcript,
  playbackActive: playbackActiveRef.current,
  audioPlaying: audio.isPlaying,
  playbackEndedAtMs: playbackEndedAtMsRef.current,
  nowMs: Date.now(),
  cooldownMs: 900,
})

if (!gate.accepted) {
  pendingNativeTranscriptRef.current = ''
  if (gate.reason === 'cooldown_active' && sessionActiveRef.current && canListenOnRouteRef.current) {
    scheduleResumeListening(900, true)
  }
  return
}
```

注意：`scheduleResumeListening` 来自 Phase 0。Phase 1 不允许再创建第二套 timer。

涉及文件：

- `apps/mobile/src/App.tsx`
- `apps/mobile/src/nativeSpeech.ts`
- `packages/session-core/src/workflow.ts`
- `tests/session-core.test.ts`

测试用例：

```ts
it('rejects transcripts while playback is active')
it('rejects transcripts during playback cooldown')
it('accepts transcripts after cooldown in listening state')
it('rejects transcripts when workflow is thinking or speaking')
```

验收标准：

- AI 播放过程中说出的文本不会进入 `/api/chat`。
- 播放刚结束的尾音不会生成新用户消息。
- 用户主动说话仍能在 cooldown 后正常被识别。

### Phase 2: 本地回声文本过滤

目标：即使 STT 收到了 AI 自己的声音，也在进入 LLM 前丢弃。

#### 2.1 新增 echo guard 文件

新建：

```text
packages/session-core/src/echo-guard.ts
```

并在：

```text
packages/session-core/src/index.ts
```

导出：

```ts
export * from './echo-guard'
```

#### 2.2 函数签名

```ts
export interface PlaybackEchoGuardInput {
  transcript: string
  lastAssistantResponse?: string | null
  playbackEndedAtMs?: number | null
  nowMs?: number
  maxEchoWindowMs?: number
  minNormalizedLength?: number
  containmentMinLength?: number
  overlapMinLength?: number
  overlapThreshold?: number
}

export interface PlaybackEchoGuardResult {
  shouldIgnore: boolean
  reason:
    | 'no_transcript'
    | 'no_assistant_response'
    | 'outside_echo_window'
    | 'too_short'
    | 'contained_in_assistant_response'
    | 'high_overlap_with_assistant_response'
    | 'not_echo'
  normalizedTranscript: string
  normalizedAssistantResponse: string
  overlapRatio: number
}

export function shouldIgnoreLikelyPlaybackEcho(input: PlaybackEchoGuardInput): PlaybackEchoGuardResult
```

默认值必须固定：

```ts
export const DEFAULT_ECHO_WINDOW_MS = 3500
export const DEFAULT_ECHO_MIN_NORMALIZED_LENGTH = 8
export const DEFAULT_ECHO_CONTAINMENT_MIN_LENGTH = 8
export const DEFAULT_ECHO_OVERLAP_MIN_LENGTH = 16
export const DEFAULT_ECHO_OVERLAP_THRESHOLD = 0.78
```

#### 2.3 归一化函数

同文件新增：

```ts
export function normalizeEchoText(value?: string | null): string
```

规则：

```text
1. 空值 -> ''
2. 转小写
3. NFKC normalize
4. 移除标点和空白
5. 保留 Unicode 字母、数字和中日韩字符
```

推荐实现：

```ts
return value
  ?.normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, '')
  ?? ''
```

#### 2.4 overlap 计算

同文件新增内部函数：

```ts
function getCharacterRecall(candidate: string, source: string): number
```

规则：

- 以 `candidate` 为分母。
- 按字符 multiset 计数，不按 set 去重。
- 返回 `candidate` 中有多少字符能在 `source` 中匹配。
- `candidate` 为空返回 `0`。

#### 2.5 echo 判断流程

必须按以下顺序判断：

```text
1. transcript trim 为空 -> shouldIgnore false, reason no_transcript
2. lastAssistantResponse 为空 -> false, no_assistant_response
3. playbackEndedAtMs 为空 -> false, outside_echo_window
4. nowMs - playbackEndedAtMs > maxEchoWindowMs -> false, outside_echo_window
5. normalizedTranscript 长度 < minNormalizedLength -> false, too_short
6. normalizedAssistantResponse.includes(normalizedTranscript)
   且 normalizedTranscript.length >= containmentMinLength
   -> true, contained_in_assistant_response
7. normalizedTranscript.length >= overlapMinLength
   且 getCharacterRecall(normalizedTranscript, normalizedAssistantResponse) >= overlapThreshold
   -> true, high_overlap_with_assistant_response
8. 否则 -> false, not_echo
```

#### 2.6 Mobile 接入点

在 `handleNativeFinalTranscript()` 中，`gateUserTranscript` 通过后、`judgeEndpoint` 前调用：

```ts
const echo = shouldIgnoreLikelyPlaybackEcho({
  transcript: endpointTranscript,
  lastAssistantResponse: snapshot.lastResponse,
  playbackEndedAtMs: playbackEndedAtMsRef.current,
  nowMs: Date.now(),
})

if (echo.shouldIgnore) {
  pendingNativeTranscriptRef.current = ''
  setStatus('session.status.listening')
  void speechStartListeningRef.current('en-US')
  return
}
```

不要把 echo 文本写入 `messages`，也不要请求 `/api/chat`。

涉及文件：

- `packages/session-core/src/echo-guard.ts`
- `packages/session-core/src/index.ts`
- `apps/mobile/src/App.tsx`
- `tests/session-core.test.ts`

测试用例：

```ts
it('ignores transcript contained in the last assistant response inside echo window')
it('ignores high-overlap transcript inside echo window')
it('does not ignore short acknowledgements')
it('does not ignore repeated assistant text outside echo window')
it('does not ignore when there is no last assistant response')
it('normalizes punctuation, case, and Chinese text')
```

验收标准：

- AI 回复被外放录回时，不新增 user message。
- 用户在 4 秒后主动复述 AI 内容，不被误杀。
- 短回答如 `yes`、`okay`、`no` 不被简单相似度误杀。

### Phase 3: Expo 音频模式验证

目标：在不写原生代码前，验证 Expo 配置能否降低回声或提升路由稳定性。

候选实验：

1. iOS 播放/录音切换：
   - 当前 `allowsRecording: false` 用于播放。
   - 当前 `allowsRecording: true` 用于录音。
   - 保持这种播放和录音互斥模式，先不要播放时同时录音。
2. 听筒路由实验：
   - 测试 `shouldRouteThroughEarpiece: true` 是否显著降低外放回声。
   - 仅作为可选模式，不默认开启，因为它会改变用户听感。
3. Android recorder 路径实验：
   - 如果未来改成本地 recorder 上传音频，可测试 `RecordingSource.voice_communication`。
   - 当前 `expo-speech-recognition` 主路径不直接受 recorder preset 影响。

#### 3.1 配置实验开关

不要直接硬改默认行为。先在 `apps/mobile/src/nativeAudio.ts` 增加局部常量：

```ts
const audioExperimentFlags = {
  routePlaybackThroughEarpieceWhenRecording: false,
  useAndroidVoiceCommunicationRecorder: false,
}
```

#### 3.2 听筒路由实验

如果 `routePlaybackThroughEarpieceWhenRecording` 为 true，则调整 recording mode：

```ts
const recordingAudioMode = {
  ...playbackAudioMode,
  allowsRecording: true,
  shouldRouteThroughEarpiece: audioExperimentFlags.routePlaybackThroughEarpieceWhenRecording,
}
```

默认必须是 `false`。

#### 3.3 Android `voice_communication` 实验

仅当走 `expo-audio` recorder 时使用。不要假设它能影响 `expo-speech-recognition`。

新增 recorder options：

```ts
const voiceCommunicationRecordingPreset = {
  ...RecordingPresets.HIGH_QUALITY,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    audioSource: 'voice_communication' as const,
  },
}
```

接入点：

```ts
const recorder = useAudioRecorder(
  audioExperimentFlags.useAndroidVoiceCommunicationRecorder
    ? voiceCommunicationRecordingPreset
    : RecordingPresets.HIGH_QUALITY,
)
```

风险：

- 这个 recorder 当前不是 native speech recognition 主路径。
- 如果未来改成本地录音上传 STT，才是有效实验路径。

涉及文件：

- `apps/mobile/src/nativeAudio.ts`
- `apps/mobile/src/nativeSpeech.ts`
- `docs/mobile-audio-qa-checklist.md`

验收标准：

- 配置变化不破坏 TTS 播放音量。
- 配置变化不破坏 speech recognition 权限和启动。
- 外放、耳机、蓝牙三种路由都有记录。

### Phase 4: Native AEC 可行性验证

目标：确认是否值得投入 native module。

#### 4.0 提前预研结论

结论：

```text
Expo 架构可以和自定义原生 AEC 共存。
Expo 当前没有跨平台 aec: true 配置。
Expo 当前没有远程 AEC 能力。
远程 AEC 不是单纯云端开关，需要上传麦克风音频和播放参考音频，当前系统 STT 路径不满足。
```

依据：

- Expo CNG/Prebuild 支持 native modules、Expo Modules API 和 config plugins；自定义原生能力可以在 Expo development build / EAS Build 中共存。
- `expo-audio` 暴露 `setAudioModeAsync`、`allowsRecording`、`shouldRouteThroughEarpiece`、Android `RecordingSource.voice_communication`，但没有跨平台 `aec` 参数。
- Apple 原生 AEC 方向通常依赖 `AVAudioSession` voice processing / voice chat 类模式或 Voice Processing I/O。
- Android 原生 AEC 方向通常依赖 `VOICE_COMMUNICATION` 音源、`AcousticEchoCanceler`，且设备支持情况必须检测。

参考：

- Expo CNG / Prebuild: https://docs.expo.dev/workflow/continuous-native-generation/
- Expo Audio SDK: https://docs.expo.dev/versions/latest/sdk/audio/
- Apple AVAudioSession: https://developer.apple.com/documentation/avfaudio/avaudiosession
- Android MediaRecorder: https://developer.android.com/media/platform/mediarecorder
- Android AcousticEchoCanceler: https://developer.android.com/reference/android/media/audiofx/AcousticEchoCanceler

#### 4.0.1 Expo 与原生 AEC 的共存方式

当前项目可选三种共存方式：

| 方式 | 是否推荐 | 说明 |
| --- | --- | --- |
| 直接改 `apps/mobile/ios` | 只适合快速实验 | 当前已有 iOS native project，可以快速验证，但长期容易和 Expo prebuild/CNG 规则漂移。 |
| Expo Module + config plugin | 推荐 | 原生代码模块化，JS 层通过 typed API 调用，后续 EAS Build 可复现。 |
| 完全 bare React Native | 暂不推荐 | 成本更高，不是验证 AEC 的必要条件。 |

推荐路径：

```text
先用 Expo Module 做最小 native audio session override
-> development build 真机验证
-> 如果有效，再沉淀成 config plugin / QA 开关
```

#### 4.0.2 Expo 当前已有能力边界

当前 `expo-audio` 可以做：

```ts
await setAudioModeAsync({
  allowsRecording: true,
  playsInSilentMode: true,
  shouldRouteThroughEarpiece: false,
})
```

以及 Android recorder preset 可以指定：

```ts
android: {
  audioSource: 'voice_communication',
}
```

但边界是：

- `allowsRecording` 只是允许录音，不等于启用 AEC。
- `shouldRouteThroughEarpiece` 是路由控制，不等于 AEC；它可能通过降低外放泄漏间接减少回声。
- `voice_communication` 只作用于 `expo-audio` recorder；当前主识别路径是 `expo-speech-recognition`，不直接吃这个 recorder preset。
- `expo-speech-recognition` 使用系统 speech recognizer，当前没有暴露“设置 AEC / voice processing mode”的 public API。

#### 4.0.3 远程 AEC 可行性判断

结论：当前阶段不具备“远程 AEC”落地条件。

远程 AEC 至少需要：

```text
micCaptureFrame[t]
speakerReferenceFrame[t]
sampleRate / channel layout 一致
时间戳对齐或可估计延迟
持续流式传输
服务端 AEC 算法或第三方实时音频 SDK
```

当前链路是：

```text
系统 speech recognition -> final transcript
完整 TTS URL -> expo-audio 播放
```

它缺少：

- 连续麦克风 PCM/Opus 流。
- 播放参考音频流和时间戳。
- 端上采集与播放的同步时钟。
- 服务端实时音频处理通道。

所以所谓“远程 AEC”不能作为当前 Expo 配置项，也不能在当前 `/api/chat` + `/api/tts` HTTP 链路里直接补上。它属于 Phase 5 语音网关方向，而不是 Phase 4 的 native AEC。

#### 4.0.4 建议提前做的 P4 spike

目标：不用改主业务链路，先确认原生 AEC 是否与 Expo speech/audio 共存。

Spike 任务：

1. iOS-only 先行。
2. 新增一个最小 Expo Module：`VoiceAudioSession`。
3. 暴露 `configureVoiceAudioSession({ mode })`。
4. 在 QA 开关下调用：
   - TTS 播放前：`mode: 'playback'`
   - 恢复监听前：`mode: 'voiceChat'`
5. 不改变 `expo-speech-recognition` 调用方式。
6. 真机验证外放下 AI 声音是否还会被识别回用户输入。

如果 iOS spike 无效，先不要做 Android。

原因：

- iOS 设备和音频栈更可控。
- 当前项目已有 `apps/mobile/ios`，试验成本低。
- Android AEC 设备差异更大，应该在 iOS 有收益后再做。

#### 4.1 Native module 形态

优先使用 Expo Module，保持当前 Expo 架构。

建议新增目录：

```text
apps/mobile/modules/voice-audio-session
```

暴露 JS API：

```ts
export type VoiceAudioSessionMode =
  | 'default'
  | 'playback'
  | 'recording'
  | 'voiceChat'

export interface ConfigureVoiceAudioSessionOptions {
  mode: VoiceAudioSessionMode
  allowBluetooth?: boolean
  defaultToSpeaker?: boolean
  mixWithOthers?: boolean
}

export interface ConfigureVoiceAudioSessionResult {
  ok: boolean
  platform: 'ios' | 'android'
  appliedMode: VoiceAudioSessionMode
  message?: string
}

export async function configureVoiceAudioSession(
  options: ConfigureVoiceAudioSessionOptions,
): Promise<ConfigureVoiceAudioSessionResult>
```

Mobile adapter 接入文件：

```text
apps/mobile/src/nativeAudio.ts
```

不要让业务层直接 import native module。`App.tsx` 只调用 `useNativeSessionAudio()`。

iOS 方向：

- 新建 Expo Module 或 React Native native module。
- 负责设置 `AVAudioSession` category/mode/options。
- 候选 mode：
  - `voiceChat`
  - `videoChat`
  - `measurement` 仅用于对照，不适合作为通话主路径。
- 验证是否能与 `expo-speech-recognition` 共存。

建议 iOS 映射：

| JS mode | AVAudioSession category | AVAudioSession mode | options |
| --- | --- | --- | --- |
| `playback` | `.playback` | `.default` | none |
| `recording` | `.playAndRecord` | `.default` | `.defaultToSpeaker`, optional `.allowBluetooth` |
| `voiceChat` | `.playAndRecord` | `.voiceChat` | `.defaultToSpeaker`, optional `.allowBluetooth` |
| `default` | current Expo behavior | current Expo behavior | none |

Android 方向：

- 优先验证 `MediaRecorder.AudioSource.VOICE_COMMUNICATION`。
- 如改成自采集音频，再评估 `AcousticEchoCanceler`。
- 当前如果仍使用系统 speech recognizer，AEC 可控性有限。

建议 Android 映射：

| JS mode | Android 行为 |
| --- | --- |
| `playback` | 维持当前播放配置。 |
| `recording` | 维持当前 speech recognition；如走 recorder，使用默认 audio source。 |
| `voiceChat` | 仅 recorder/STT 自采集路径使用 `VOICE_COMMUNICATION`。 |
| `default` | 不做 native override。 |

#### 4.2 feature flag

新增配置，不默认启用：

```ts
const nativeAudioSessionFlags = {
  enableNativeVoiceChatSession: false,
}
```

只有 QA build 可以打开，生产默认关闭。

涉及路径：

- `apps/mobile/ios`
- 后续如生成 Android native project：`apps/mobile/android`
- 可新增 `apps/mobile/modules/*` 或独立 Expo Module package。

验收标准：

- 原生配置能稳定编译 development build。
- iOS 真机外放回声明显下降。
- 不破坏现有 TTS 播放、STT 权限和前后台恢复。
- 有明确 fallback：原生配置失败时回到当前 Expo 模式。

### Phase 5: 流式语音链路评估

目标：只做评估，不进入当前短期实现。

如果要接近豆包电话体验，需要：

- 流式 STT。
- 流式 LLM。
- 流式 TTS。
- barge-in 打断。
- 统一 voice gateway 管理会话状态。

该阶段通常需要服务端支持，不建议作为当前 mobile 稳定性修复的一部分。

#### 5.1 目标架构草图

```text
apps/mobile
  nativeSpeech/nativeRecorder
    -> WebSocket voice gateway
      -> streaming STT
      -> streaming LLM
      -> streaming TTS
    <- audio chunks
  nativeAudio playback queue
```

#### 5.2 服务端模块边界

如果未来启动，新增服务端模块应放在：

```text
apps/web/app/api/voice-session/*
apps/web/lib/server/voice/*
packages/api-client/src/*
packages/session-core/src/*
```

客户端仍通过 `packages/api-client` 或专用 mobile voice adapter 调用，不允许 mobile 直接持有第三方 STT/TTS key。

## 推荐执行顺序

1. Phase 0：先修复恢复监听 bug。
2. Phase 1：收紧状态门控。
3. Phase 2：加本地文本回声过滤。
4. Phase 3：跑 Expo 配置实验和真机 QA。
5. Phase 4：只有 Phase 1-3 不够时再做 native AEC。
6. Phase 5：作为长期低延迟语音体验专项。

## QA 矩阵

每次改动至少覆盖：

| 场景 | 外放 | 有线/蓝牙耳机 | 前后台 | 期望 |
| --- | --- | --- | --- | --- |
| 正常一轮对话 | 必测 | 必测 | 可选 | 播放后恢复监听 |
| AI 声音被录回 | 必测 | 可选 | 可选 | 不进入 LLM |
| 用户快速接话 | 必测 | 必测 | 可选 | cooldown 后可识别 |
| correction 播放 | 必测 | 可选 | 可选 | 播放后回到 session |
| 播放中切后台 | 必测 | 可选 | 必测 | 不被旧 timer 拉起 |
| 弱网 TTS 延迟 | 必测 | 可选 | 可选 | 状态不死锁 |

QA 结果记录到：

- `docs/mobile-audio-qa-checklist.md`

## 不做事项

当前阶段不做：

- 不直接上流式 TTS/STT。
- 不引入 voice gateway 服务器。
- 不把 API key 放进 mobile client。
- 不在没有真机验证前默认开启听筒路由。
- 不把 Android recorder 的 `voice_communication` 误认为能直接影响 `expo-speech-recognition`。

## 交付标准

每个 phase 合入前必须满足：

- 代码改动有明确文件边界。
- `npm --workspace @meteorvoice/mobile run typecheck` 通过。
- 如果改 `packages/session-core`，补充 `npm run packages:test`。
- 更新 `docs/mobile-audio-qa-checklist.md` 的实际验证结果或注明未验证原因。
- PR 描述中明确风险、回滚方式和真机覆盖范围。
