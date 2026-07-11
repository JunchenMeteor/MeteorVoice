import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  mkdtemp,
  readdir,
  stat,
} from 'node:fs/promises'
import {
  join,
} from 'node:path'
import { tmpdir } from 'node:os'

import {
  cacheTTSDataUrl,
  getCachedTTSAudioByToken,
  getCachedTTSAudioForUser,
  pruneTTSAudioCache,
  shouldUseLocalTTSAudioCache,
} from '@/lib/server/tts-audio-cache'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('TTS audio cache', () => {
  it('is disabled unless local-cache delivery is configured', () => {
    expect(shouldUseLocalTTSAudioCache()).toBe(false)

    vi.stubEnv('TTS_AUDIO_DELIVERY', 'local-cache')

    expect(shouldUseLocalTTSAudioCache()).toBe(true)
  })

  it('stores data URL audio on disk and indexes ownership in SQLite', async () => {
    const cacheDir = await makeCacheDir()
    vi.stubEnv('TTS_AUDIO_CACHE_DIR', cacheDir)

    const cachedAudio = await cacheTTSDataUrl('data:audio/mp3;base64,aGVsbG8=', 'user-a', 'https://meteorvoice.test')

    expect(cachedAudio?.audioUrl).toMatch(/^https:\/\/meteorvoice\.test\/api\/tts\/audio\/[a-f0-9-]{36}\?token=[a-f0-9]{64}$/)
    const url = new URL(cachedAudio!.audioUrl)
    const audioId = url.pathname.split('/').pop()!
    const token = url.searchParams.get('token')!
    const ownerAudio = await getCachedTTSAudioForUser(audioId, 'user-a')
    const tokenAudio = await getCachedTTSAudioByToken(audioId, token)
    const invalidTokenAudio = await getCachedTTSAudioByToken(audioId, '0'.repeat(64))
    const otherUserAudio = await getCachedTTSAudioForUser(audioId, 'user-b')

    expect(ownerAudio).toMatchObject({
      contentType: 'audio/mpeg',
      bytes: 5,
    })
    expect(tokenAudio).toMatchObject({
      contentType: 'audio/mpeg',
      bytes: 5,
    })
    expect(invalidTokenAudio).toBeNull()
    expect(otherUserAudio).toBeNull()
    await expect(stat(join(cacheDir, 'tts-audio-cache.sqlite'))).resolves.toMatchObject({ size: expect.any(Number) })
  })

  it('removes oldest files when the cache exceeds the byte cap', async () => {
    const cacheDir = await makeCacheDir()
    vi.stubEnv('TTS_AUDIO_CACHE_DIR', cacheDir)
    vi.stubEnv('TTS_AUDIO_CACHE_MAX_BYTES', '8')

    const first = await cacheTTSDataUrl('data:audio/mp3;base64,MTIzNDU=', 'user-a')
    const second = await cacheTTSDataUrl('data:audio/mp3;base64,MTIzNDU=', 'user-a')

    const firstId = audioIdFromUrl(first!.audioUrl)
    const secondId = audioIdFromUrl(second!.audioUrl)

    expect(await getCachedTTSAudioForUser(firstId, 'user-a')).toBeNull()
    expect(await getCachedTTSAudioForUser(secondId, 'user-a')).not.toBeNull()
  })

  it('removes expired files by TTL', async () => {
    const cacheDir = await makeCacheDir()
    vi.stubEnv('TTS_AUDIO_CACHE_DIR', cacheDir)
    vi.stubEnv('TTS_AUDIO_CACHE_TTL_DAYS', '1')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const cachedAudio = await cacheTTSDataUrl('data:audio/mp3;base64,aGVsbG8=', 'user-a')
      const audioId = audioIdFromUrl(cachedAudio!.audioUrl)

      vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'))
      await pruneTTSAudioCache()

      expect(await getCachedTTSAudioForUser(audioId, 'user-a')).toBeNull()
      const files = await readdir(cacheDir)
      expect(files.filter(file => file.endsWith('.mp3'))).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

async function makeCacheDir() {
  return mkdtemp(join(tmpdir(), 'meteorvoice-tts-cache-'))
}

function audioIdFromUrl(audioUrl: string) {
  const parsed = audioUrl.startsWith('http')
    ? new URL(audioUrl)
    : new URL(audioUrl, 'https://meteorvoice.test')
  return parsed.pathname.split('/').pop()!
}
