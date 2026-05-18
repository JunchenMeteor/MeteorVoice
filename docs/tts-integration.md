# TTS Integration Guide

## Current State

Browsers: `speechSynthesis` API — robotic voice, no accent control.

## Provider Comparison

| Provider | Free Tier | Beyond Free | Accent Support | latency |
|---|---|---|---|---|
| **Google Cloud TTS** | 400万字符/月 (Standard) | $4/百万字符 | 多英语口音 | ~200ms |
| Microsoft Azure | 50万字符/月 (Neural) | $15/百万字符 | 多英语口音 | ~300ms |
| OpenAI TTS | 无 | $15/百万字符 | 基本 | ~400ms |
| ElevenLabs | 10分钟/月 | $5/月起 | 最优 | ~75ms (Flash) |

**推荐：Google Cloud TTS**
- 免费额度最大（400万字符足够 MVP）
- 付费最便宜（$4/百万字符）
- 支持 British、American、Australian、Indian 等口音
- 已有 Node.js SDK，接入成本低

## Google Cloud TTS Setup

### 1. Create GCP Project + Enable API

```bash
# 创建项目
gcloud projects create meteorvoice-tts

# 启用 TTS API
gcloud services enable texttospeech.googleapis.com

# 创建服务账号
gcloud iam service-accounts create meteorvoice-tts \
  --display-name="MeteorVoice TTS"

# 下载密钥
gcloud iam service-accounts keys create ~/tts-key.json \
  --iam-account=meteorvoice-tts@meteorvoice-tts.iam.gserviceaccount.com
```

### 2. Set Environment Variable

本地 `.env.local`:
```
GOOGLE_TTS_KEY={"type":"service_account",...}
```

Vercel: 添加 `GOOGLE_TTS_KEY` 环境变量（把 JSON 内容整体放进去）

### 3. Install SDK

```bash
npm install @google-cloud/text-to-speech
```

### 4. Create Provider (`lib/providers/google-tts.ts`)

```typescript
import type { TTSProvider, TTSResult } from './types'

const accentVoiceMap: Record<string, { languageCode: string; name: string }> = {
  'british':    { languageCode: 'en-GB', name: 'en-GB-Studio-B' },
  'american':   { languageCode: 'en-US', name: 'en-US-Studio-O' },
  'australian': { languageCode: 'en-AU', name: 'en-AU-Studio-B' },
  'indian':     { languageCode: 'en-IN', name: 'en-IN-Studio-A' },
  'singapore':  { languageCode: 'en-SG', name: 'en-US-Studio-O' },  // fallback
  'african':    { languageCode: 'en-ZA', name: 'en-US-Studio-O' },  // fallback
}

export function createGoogleTTS(): TTSProvider {
  const key = process.env.GOOGLE_TTS_KEY
  if (!key) {
    throw new Error('GOOGLE_TTS_KEY not set')
  }

  const client = new (require('@google-cloud/text-to-speech').v1.TextToSpeechClient)({
    credentials: JSON.parse(key),
  })

  return {
    async synthesize(
      text: string,
      options?: { accent?: string; speed?: number },
    ): Promise<TTSResult> {
      const voiceConfig = accentVoiceMap[options?.accent ?? 'american']
        ?? accentVoiceMap['american']

      const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: {
          languageCode: voiceConfig.languageCode,
          name: voiceConfig.name,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: options?.speed ?? 1.0,
        },
      })

      const audioContent = response.audioContent as string | Uint8Array
      const buffer = typeof audioContent === 'string'
        ? Buffer.from(audioContent, 'base64')
        : Buffer.from(audioContent)
      const audioUrl = `data:audio/mp3;base64,${buffer.toString('base64')}`
      const duration = text.length * 0.05

      return { audioUrl, duration }
    },
  }
}
```

### 5. Add API Route (`app/api/tts/route.ts`)

```typescript
import { NextResponse } from 'next/server'
import { createGoogleTTS } from '@/lib/providers/google-tts'
import { createMockTTS } from '@/lib/providers/mock-tts'

export async function POST(request: Request) {
  try {
    const { text, accent, speed } = await request.json() as {
      text: string; accent?: string; speed?: number
    }

    let tts
    try {
      tts = createGoogleTTS()
    } catch {
      tts = createMockTTS()
    }

    const result = await tts.synthesize(text, { accent, speed })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 })
  }
}
```

### 6. Update SessionPage

Replace `const tts = createMockTTS()` with `fetch('/api/tts', ...)`:

```typescript
async function speakText(text: string, accentName: string) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, accent: accentName.toLowerCase() }),
  })
  const { audioUrl } = await res.json()
  if (audioUrl) {
    const audio = new Audio(audioUrl)
    await audio.play()
  }
}
```

## Cost Estimate for MVP

- 一次练习约 10 轮对话，每轮 AI 回复 ~200 字符
- 一次 session: 10 × 200 = 2,000 字符
- 每天 10 次 session: 20,000 字符
- 每月: 600,000 字符

**完全在 Google 免费 400 万字符额度内，免费。**

## ElevenLabs Alternative (Higher Quality)

如果需要最高质量的语音，ElevenLabs 接入成本类似但需注册：

```bash
npm install elevenlabs
```

API key: `ELEVENLABS_API_KEY`

参照同样 Provider 模式，在 `lib/providers/elevenlabs-tts.ts` 中实现。

## Migration Path

1. 先接 Google Cloud TTS 验证口音切换效果
2. 如果语音质量不够，可无缝切换 ElevenLabs（Provider 接口已定义好）
3. 两种 Provider 可共存，按 `TTS_PROVIDER` 环境变量切换
