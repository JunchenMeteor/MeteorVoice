# 三合一层级判停方案

本文档定义 **LLM 语义判停 + 本地快速判断 + 安全网超时** 三层架构的落地方案。

## 当前状态

`packages/session-core/src/workflow.ts` 已有基于正则的本地快速判断（即 Layer 1）：

- `looksLikeIncompleteSpeech()` — 检测 trailing "and/but/because/that/就是/然后"、filler "um/嗯/啊"、leading "I mean/那个/就是"、短于 3 词无标点句
- `endsWithThinkingFiller()` — 检测尾部的 um/uh/嗯/啊
- `containsChineseText()` — 检测中英混杂
- `getSilenceFinalizeDelay()` — 根据模式返回不同静默时长（1700/2200/2600/3400ms）
- `getSpeechEndpointDelay()` — 组合模式判断 + VAD hold

**问题**：纯正则无法处理微妙场景，比如：
- "I think it's very important to..." — 结尾 to 被判为 incomplete（对），用户确实在想
- "I went there because my friend asked" — 结尾 asked 前面有 because，但因为句子足够完整，正则可能误判
- "The weather today is really nice" — 这是个完整句，但如果用户语速慢在中间刻意停顿，没有正则标记

## 目标架构

```
用户语音输入 → 实时 ASR 中间结果
    │
    ▼
┌─────────────────────────────────────────────┐
│  Layer 1: 本地快速判断（现有逻辑增强）          │
│  - 每次收到中间结果立即执行                      │
│  - 延迟：<1ms                                 │
│  - 成本：0                                    │
│  - 输出：complete | incomplete | uncertain     │
│                                               │
│  判断依据：                                    │
│  - COMPLETE_ENDING: 句号/问号/感叹号结尾        │
│  - TRAILING_CONJUNCTION: and/but/所以/因为...  │
│  - FILLER: um/uh/嗯/啊...                     │
│  - SHORT_COMPLETE: 短应答("Yes"/"I see"/"OK") │
│  - 中英混杂检测                                │
│  - 词数统计 + 主谓结构检测                      │
└─────────────────────────────────────────────┘
    │
    │ uncertain（无法确定）
    ▼
┌─────────────────────────────────────────────┐
│  Layer 2: LLM 语义判停（仅在不确定时调用）       │
│  - 500ms 声学停顿触发                          │
│  - 延迟：200-400ms（DeepSeek 首 token）         │
│  - 成本：~50 input + 1 output token            │
│  - 输出：done | thinking                       │
│                                               │
│  Prompt:                                      │
│  "对话上下文：{最近几条消息}                     │
│   用户正在说：'{transcript}'                    │
│   用户是说完了还是在思考下一句？                  │
│   只回答 done 或 thinking。"                   │
└─────────────────────────────────────────────┘
    │
    │ done → 立即提交 turn
    │ thinking → 继续听，回到 Layer 1
    ▼
┌─────────────────────────────────────────────┐
│  Layer 3: 安全网超时                          │
│  - 单次 utterance 最长保护：45s                │
│  - 异常静默保护：8s                            │
│  - LLM 判停请求预算：1.5s                      │
│  - 超时后强制提交 current transcript           │
│  - 覆盖所有异常情况                            │
└─────────────────────────────────────────────┘
```

## 架构约束（统一调度）

核心原则：**所有判停逻辑 MUST 集中在 `session-core`，由平台统一调度入口函数决定行为。**

```
                         ┌──────────────────────────┐
                         │    session-core           │
                         │                           │
  Platform events ──────▶│  judgeEndpoint()          │
                         │    ├─ Layer 1: 本地判断    │
                         │    ├─ Layer 2: 调 LLM     │
                         │    └─ Layer 3: 安全网超时   │
                         │                           │
                         │  返回: submit | continue   │
                         └──────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              apps/web      apps/mobile    所有 future 端
```

**边界规则（和现有 session-core 一致）：**

- `session-core` MUST 暴露统一的 `judgeEndpoint(input) → 'submit' | 'continue'` 入口，所有平台调用同一个函数
- LLM 调用 MUST 以**依赖注入**方式传入：`judgeEndpoint(input, { semanticCheck?: fn })`，`session-core` 不 import DeepSeek/AI SDK
- `session-core` MUST NOT 访问 Browser Speech API、Expo Audio、DOM、React state、Supabase、HTTP fetch
- 平台 adapter 负责采集原始信号（transcript、voice activity、final/interim），转为纯数据后传 `session-core`
- 超时管理由 `session-core` 内部的 timestamp 机制处理，平台只需传入 `nowMs`

**函数签名：**

```typescript
// packages/session-core/src/endpointing.ts

type EndpointJudgment = 'submit' | 'continue'
type EndpointJudgmentReason = 
  | 'confident_complete'       // L1: 标点结尾 + 足够词数
  | 'confident_incomplete'      // L1: filler/trailing conjunction
  | 'llm_done'                  // L2: LLM 判定 done
  | 'llm_thinking'              // L2: LLM 判定 thinking
  | 'max_listening_timeout'     // L3: 单次 utterance 太长，强制提交
  | 'max_silence_timeout'       // L3: 最近无人声太久，强制提交
  | 'no_transcript_yet'         // 还没听到任何内容

interface EndpointResult {
  judgment: EndpointJudgment
  reason: EndpointJudgmentReason
}

function judgeEndpoint(input: {
  transcript: string
  isFinalResult?: boolean
  voiceActivity?: VoiceActivitySnapshot | null
  listeningDurationMs: number
  messages?: ConversationMessage[]
  scenario?: string
  semanticCheck?: (transcript: string, context: {
    messages: ConversationMessage[]
    scenario: string
  }) => Promise<'done' | 'thinking'>
}, options?: {
  nowMs?: number
  maxListeningMs?: number
  maxSilenceMs?: number
  pauseDelayMs?: number
  semanticTimeoutMs?: number
}): Promise<EndpointResult>
```

**为什么一个入口函数，而不是三个分散的函数：**
- 外部只需 `await judgeEndpoint(...)`，不需要知道有几层、各层怎么判断
- 未来 Layer 2 换 provider（比如从 DeepSeek 换 OpenAI），只在依赖注入处改，session-core 不动
- 超时逻辑与判停逻辑内聚在一起，不会出现 Web 设 15s、Mobile 忘设的漂移

## 实施计划

### Phase 1: session-core 新增 semantic endpointing 模块（新建文件）

**文件：`packages/session-core/src/endpointing.ts`**

```typescript
// 导出类型
type TurnJudgment = 'complete' | 'incomplete' | 'uncertain'

// 核心函数
function judgeTurnLocally(transcript: string): TurnJudgment
  // 增强版 looksLikeIncompleteSpeech，返回三态而非二态

function canEndTurnConfidently(transcript: string): boolean
  // Layer 1 确定可以结束（标点结尾 + 足够词数 + 不触发 incomplete 模式）

function mustExtendListening(transcript: string): boolean
  // Layer 1 确定必须延长（filler、trailing conjunction、leading continuation）

interface SemanticCheckResult {
  isComplete: boolean
  confidence: 'high' | 'medium' | 'low'
}

// LLM 调用接口（平台无关，由调用方注入 fetch 实现）
type SemanticEndpointCheck = (
  transcript: string,
  context?: { messages: ConversationMessage[]; scenario: string }
) => Promise<SemanticCheckResult>

// 安全网与交互预算
const MAX_UTTERANCE_MS = 45000
const MAX_SILENCE_MS = 8000
const SEMANTIC_ENDPOINT_TIMEOUT_MS = 1500
const PAUSE_TRIGGER_DELAY_MS = 500 // 声学停顿后等多久触发语义判停
```

### Phase 2: Web 端接入（VoiceSessionProvider）

改动点：
- `simulateTurn` 中：收到 transcript 后先用 Layer 1 判断
- Layer 1 uncertain → 等 500ms 停顿 → 调 DeepSeek 语义判停
- done → 立即走现有 turn 流程
- thinking → 继续当前 listening turn，重新启动平台 STT 采集，但不得接受 transcript 或递增业务 turn
- thinking 续听 MUST 累积当前 transcript；下一次 STT final 后提交的是合并后的同一条用户 utterance
- 调用 `stopVoiceLevelSampling()` 前 MUST 先保存当前 `VoiceActivitySnapshot`，避免判停时丢失 VAD 数据
- 语义判停 await 后 MUST 重新检查 active session / current turn，防止 stale result 提交旧 transcript

新增文件：`apps/web/lib/server/semantic-endpoint.ts`
- 封装 DeepSeek 调用，判断 done/thinking
- 复用现有的 `ai-provider.ts` 的 DeepSeek client

### Phase 3: Mobile 端接入（nativeSpeech）

改动点：
- `nativeSpeech.ts`：降低 Android 静默参数（2600ms → 不设），改为收到 final result 后立即触发判停流程
- 在 `onFinalTranscript` 的逻辑中：
  - Layer 1 判断
  - uncertain → 走 API 语义判停
  - 判停时录音已停，不需要额外停顿
  - thinking 续听 MUST 累积当前 transcript；后续 final transcript 与前半句合并后再提交
  - 语义判停 await 后 MUST 确认 session 仍 active，防止结束会话后旧结果继续提交

Mobile 端特殊之处：
- `expo-speech-recognition` 的 `continuous: false` — 系统自己判停后才给 final result
- 所以 Mobile 端的 "500ms 停顿" 不是我们控制的，是系统判定的
- Mobile 端 Layer 2 在收到 final result 后执行（系统已判定用户说完，我们二次确认）

### Phase 4: 测试和微调

- 单元测试：`tests/semantic-endpointing.test.ts`
- 覆盖 Layer 1 各种 case
- Layer 2 的基准测试（用已知上下文的 transcript 验证 LLM 输出）

## 改动范围

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `packages/session-core/src/endpointing.ts` | **新建** | 三层判停核心逻辑 |
| `packages/session-core/src/index.ts` | 修改 | 导出新模块 |
| `apps/web/lib/server/semantic-endpoint.ts` | **新建** | DeepSeek 语义判停调用 |
| `apps/web/components/VoiceSessionProvider.tsx` | 修改 | 接入三层判停 |
| `apps/mobile/src/nativeSpeech.ts` | 修改 | 接入判停流程 |
| `packages/shared/src/i18n.ts` | 修改 | 新增相关 key |
| `tests/endpointing.test.ts` | **新建** | 判停逻辑测试 |

## Layer 2 API 设计

### 请求

```typescript
// POST /api/semantic-endpoint（或复用 DeepSeek 直接调用）
{
  transcript: "I think the most important thing is",
  context: {
    messages: [
      { role: "user", content: "What do you think about AI?" },
      { role: "assistant", content: "That's an interesting question..." },
      { role: "user", content: "I think the most important thing is" }
    ]
  }
}
```

### 响应

```typescript
{
  judgment: "done" | "thinking",
  confidence: "high" | "medium" | "low"
}
```

### Prompt

```
You are a turn-taking detector for an English conversation practice app.

The user is practicing English speaking. Here is the conversation context:
---
{previous messages}
---

The user is currently saying: "{transcript}"

Based on the user's speech and the conversation context, is the user:
- "done" — finished expressing a complete thought and waiting for a reply
- "thinking" — still formulating their sentence, pausing mid-thought

Reply with exactly one word: done or thinking.
```

## 验收

- `npm run lint` + `npm test`
- Layer 1 本地判断：100% 覆盖 `complete` / `incomplete` / `uncertain` 三类输出
- Layer 2 语义判停：在不确定的中间句上正确返回 thinking，完整句上返回 done
- Layer 3 安全网：45s 单次 utterance 上限、8s 异常静默上限、1.5s LLM 判停超时
- Web 端：在 `/session` 实际对话中验证延迟改善
- Mobile 端：Android 不再有 2600ms 固定延迟
