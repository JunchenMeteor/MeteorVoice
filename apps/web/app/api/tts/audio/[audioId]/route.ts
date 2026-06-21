/**
 * Authenticated TTS audio delivery. / 已鉴权 TTS 音频交付。
 */
import {
  createReadStream,
  statSync,
} from 'node:fs'

import {
  getCachedTTSAudioByToken,
  getCachedTTSAudioForUser,
} from '@/lib/server/tts-audio-cache'
import {
  getApiUser,
  guardApiRequest,
  isApiErrorResult,
  jsonApiResult,
  jsonServerError,
} from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ audioId: string }> },
) {
  try {
    const guard = guardApiRequest(request, { name: 'tts_audio', windowMs: 60_000, maxRequests: 240 })
    if (guard) return jsonApiResult(guard)

    const { audioId } = await context.params
    const token = new URL(request.url).searchParams.get('token')?.trim()
    const cachedAudio = token
      ? await getCachedTTSAudioByToken(audioId, token)
      : await getCachedTTSAudioForAuthenticatedUser(audioId)
    if (!cachedAudio) {
      return Response.json({ error: 'Audio not found' }, { status: 404 })
    }

    const range = request.headers.get('range')
    if (range) return rangeResponse(cachedAudio.filePath, cachedAudio.contentType, range)

    const stream = createReadStream(cachedAudio.filePath)
    return new Response(stream as unknown as BodyInit, {
      headers: {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=604800',
        'Content-Length': String(cachedAudio.bytes),
        'Content-Type': cachedAudio.contentType,
      },
    })
  } catch (error) {
    return jsonServerError(error, 'TTS audio delivery failed')
  }
}

async function getCachedTTSAudioForAuthenticatedUser(audioId: string) {
  const auth = await getApiUser()
  if (isApiErrorResult(auth)) return null
  return getCachedTTSAudioForUser(audioId, auth.user.id)
}

function rangeResponse(filePath: string, contentType: string, range: string) {
  const fileSize = statSync(filePath).size
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    })
  }

  const requestedStart = match[1] ? Number(match[1]) : 0
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1
  const start = Math.max(0, requestedStart)
  const end = Math.min(fileSize - 1, requestedEnd)

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    })
  }

  const stream = createReadStream(filePath, { start, end })
  return new Response(stream as unknown as BodyInit, {
    status: 206,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=604800',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Type': contentType,
    },
  })
}
