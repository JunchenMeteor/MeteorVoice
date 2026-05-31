# Session Endpointing and VAD Plan

本文档定义会话页“用户是否说完”的判断方案。后续 AI agent 修改 Web/Mobile 语音轮次、STT、VAD、静音等待或回复触发逻辑前，MUST 先读本文件。

## 目标

用户说话结束判断 MUST 从“固定静音时间”升级为以 VAD/语音活动为主的 endpointing：

- VAD/语音活动判断：最近是否还有真实人声或系统识别活动。
- STT 事件判断：是否已经收到 final result，还是只有 interim/partial。
- STT 文本判断：只作为“明显还没说完”的延迟保护，不作为必须完整的提交条件。
- STT 语言策略：MeteorVoice 是英语练习产品，STT SHOULD 默认使用英语识别模型；中英混输由 AI coaching 解释中文词汇，而不是切到中文识别模型牺牲英文准确率。
- 兜底窗口：只作为保护，不再作为唯一依据。

核心原则：

- 最近已经没有人声且有 transcript 时 SHOULD 尽快提交，即使文本不是完整句，也交给 AI 承接、追问或纠正。
- 语气词、连接词、介词/冠词结尾、中文连接词、明显铺垫词 SHOULD 继续等待。
- 中英混输 MUST 保留为有效输入，不应因非英文片段被丢弃。
- 固定时间阈值 MUST 只作为 endpoint window 的上限/下限，不应重新变成唯一判断。

## 当前落地策略

## 架构取舍

当前实现遵循现有双端架构边界：

- `packages/session-core` 保存 endpointing 纯规则：明确完成快通道、voice activity snapshot、动态 hold 计算。
- `apps/web` 只负责采集 Browser Speech/Web Audio 信号，不复制业务判断。
- `apps/mobile` 只负责采集 Expo native speech 事件，不复制业务判断。
- 页面组件不直接判断“是否说完”，只消费 session/provider/adapter 输出的结果。

这样做的原因：

- Web 和 Mobile 的底层语音能力不同，不能把 Browser API 或 Expo API 塞进 `session-core`。
- “什么时候该提交给 AI”是跨端业务规则，必须统一在 `session-core`。
- 平台 adapter 只把原始平台信号转成 `VoiceActivitySnapshot`、transcript、final/interim 这类纯数据。

禁止做法：

- 禁止在 `SessionPage.tsx` 或 Mobile 页面里手写另一套 endpoint 判断。
- 禁止 Web/Mobile 各自维护不同语义的“静音结束”规则。
- 禁止为了 Mobile 真音频 VAD 把 `expo-audio` 或 native module 直接引入 `session-core`。

### Web

Web 使用两路信号：

- Browser Speech API 提供 transcript、final/interim result。
- Web Audio `AnalyserNode` 提供本地麦克风音量，更新 voice activity snapshot。

当前实现不新增依赖、不调用云 VAD、不增加服务器成本。

Web endpoint 逻辑：

1. STT result 更新 transcript。
2. Web Audio VAD 更新最近人声活动时间。
3. 如果最近仍有人声，延后 finalize。
4. 如果最近无人声且有 transcript，则提交给 AI。
5. 文本规则只在明显没说完时增加短保护窗口，例如 filler、连接词或冠词结尾。

### Mobile

Mobile 当前使用 Expo native speech recognition。该库的 final result 已包含系统级 endpointing，系统底层通常已经结合了原生 VAD。

Mobile 当前策略：

- 默认使用 `en-US` speech locale，优先保证英语练习的识别准确率。
- final transcript 可直接提交给 AI。
- partial/final result 事件作为 speech activity 信号，并转换为 `session-core` 的 `VoiceActivitySnapshot`。
- 文本规则只作为明显没说完时的短保护，不要求 transcript 是完整句。

限制：

- Expo speech recognition adapter 当前不稳定暴露实时麦克风 metering。
- `expo-audio` recording metering 可用，但与 native speech recognition 同时录音可能产生平台音频会话冲突。
- 因此 Mobile 本轮不强行并发录音做自定义 VAD；如后续需要真正音频级 VAD，SHOULD 增加 native module 或把语音输入切到统一 recording pipeline。

Mobile 当前方案与真音频 VAD 的本质区别：

- 当前方案依赖系统 speech recognition 的 endpointing，再用 MeteorVoice 文本保护规则补一层。优点是成本低、风险低、不抢麦克风；缺点是系统误判时我们只能事后保护。
- 真音频 VAD 是 MeteorVoice 自己直接采麦克风音频，独立判断最近有没有人声。优点是更可控、更统一；缺点是需要 native audio pipeline、真机调参，并可能与系统 speech recognition 的麦克风占用冲突。

当前选择原因：

- Web 已经稳定拥有 Web Audio 麦克风采样，因此本轮可以落地真音频 activity。
- Mobile 已经使用系统 native speech recognition，系统本身包含 endpointing；贸然并发录音采样会增加权限、音频会话和设备差异风险。
- 因此 Mobile 本轮先采用系统 endpoint + speech event activity + 统一 `session-core` 保护规则。真音频 VAD 作为下一阶段 native module 或统一录音链路增强。
- Native VAD module 本轮明确暂缓；除非真机 QA 证明系统 native speech endpoint 仍无法满足业务体验，否则不要新增 native VAD module。

### Web 轻量 VAD 调参策略

Web 端当前是轻量 VAD，不追求替代系统级 DSP。实现 MUST 避免因底噪导致一直 listening：

- 使用最低人声阈值，过滤小音量底噪。
- 使用动态噪声倍数，让阈值随环境底噪上升。
- 使用平滑峰值比例，而不是单帧绝对最高值，避免咳嗽、敲击麦克风、键盘声把阈值瞬间抬太高。
- 使用最大 VAD hold 上限，确保噪声误判不会无限阻止提交。

如需调试 Web VAD，可在浏览器控制台执行：

```js
localStorage.setItem('meteorvoice-debug-vad', 'true')
```

刷新页面后，控制台会输出 `level`、`peakLevel`、`smoothedPeakLevel`、`threshold`、`noiseFloor`、`isVoiceActive` 和 endpoint hold 信息。

关闭调试：

```js
localStorage.removeItem('meteorvoice-debug-vad')
```

## session-core 边界

`packages/session-core` SHOULD 只保存纯规则：

- `isTurnDefinitelyComplete`，仅用于短应答和明确完整句的快通道
- `getSpeechEndpointDelay`
- voice activity snapshot/update/hold 判断

`session-core` MUST NOT 访问：

- Browser Speech API
- Web Audio API
- Expo Audio
- Expo Speech Recognition
- DOM、React state、权限 API

平台 adapter 负责采集信号，再把纯数据交给 `session-core`。

## 后续增强

如果当前策略仍有明显误判，下一步 SHOULD 做：

1. Web 增加可观察调试字段：last voice age、noise floor、endpoint reason。
2. Mobile development build 验证 speech recognition 是否暴露更稳定的音量/活动事件。
3. 如需要原生级 VAD，新增 Expo native module：
   - iOS: `AVAudioEngine` input tap + RMS/noise gate。
   - Android: `AudioRecord` short buffer + RMS/noise gate。
4. 统一把原生 VAD snapshot 传入 `session-core`，保持业务规则跨端一致。

### LLM 语义判停（下一阶段主方向）

参见 `docs/semantic-endpointing-plan.md`。核心思路：将"纯声学 VAD + 固定静默等待"升级为三层架构：

| 层 | 方式 | 延迟 | 成本 |
|----|------|------|------|
| L1 本地快速判断 | 只判断高置信完成短句/完整句 | <1ms | 0 |
| L2 LLM 语义判停 | DeepSeek 单 token 判断 done/thinking | 目标 200-400ms，最多 1.5s | ~50 tokens |
| L3 安全网超时 | 45s 单次 utterance 上限，8s 异常静默上限 | — | 0 |

LLM 语义判停负责 `uncertain` 场景，包括看起来可能未完成的连接词、介词、filler 和普通短句。L1 不维护大规模 incomplete 正则库，只保留高置信完成快通道，避免短句问候、`yes/no`、`good morning` 这类有效 utterance 被本地规则卡住。

时间窗口 MUST 分层理解：

- `pauseDelayMs = 500ms`：最近人声结束后，进入 L2 语义判停前的最小停顿。
- `semanticTimeoutMs = 1500ms`：L2 判停请求的交互预算；超时按 `done` 提交，避免判停本身拖慢回复。
- `maxSilenceMs = 8000ms`：曾经检测到人声但长期无新声音时的异常静默兜底。
- `maxListeningMs = 45000ms`：单次用户 utterance 的最长保护窗口，允许慢速表达，但防止永远卡在 listening。

## 验收

- `npm run lint`
- `npm run mobile:typecheck`
- `npm test`
- Web 端测试：
  - 正常完整句不会长时间等待。
  - `um/uh/嗯/啊` 后不会立刻结束。
  - `I want to`、`because`、`for`、`a/the` 等未完形态不会立刻结束。
  - `I want to 预约 a table` 能进入对话并触发中文词汇解释。
- Mobile 端测试：
  - final transcript 后仍走文本 endpoint guard。
- 英语练习默认使用英语 STT 模型，中文 UI 不应把 speech locale 切成中文。
  - 不支持实时 metering 的设备仍能退回 native speech recognition 的系统 endpointing。
