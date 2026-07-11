/**
 * Local TTS audio cache. / 本地 TTS 音频缓存。
 */
import {
  mkdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

type AudioCacheMetadata = {
  id: string
  userId: string
  accessToken: string
  fileName: string
  contentType: string
  bytes: number
  createdAtMs: number
}

type CachedAudio = {
  id: string
  audioUrl: string
}

type CacheRow = {
  id: string
  user_id: string
  access_token: string
  file_name: string
  content_type: string
  bytes: number
  created_at_ms: number
}

type SQLiteStatement = {
  all(): unknown[]
  get(...values: unknown[]): unknown
  run(...values: unknown[]): unknown
}

type SQLiteDatabase = {
  close(): void
  exec(sql: string): void
  prepare(sql: string): SQLiteStatement
}

type SQLiteModule = {
  DatabaseSync: new (fileName: string) => SQLiteDatabase
}

const defaultCacheDir = '/var/lib/meteorvoice/tts-cache'
const defaultMaxBytes = 10 * 1024 * 1024 * 1024
const defaultTtlDays = 7
const idPattern = /^[a-f0-9-]{36}$/
const tokenPattern = /^[a-f0-9]{64}$/
const databaseFileName = 'tts-audio-cache.sqlite'
const requireNodeModule = createRequire(import.meta.url)

export function shouldUseLocalTTSAudioCache() {
  return process.env.TTS_AUDIO_DELIVERY === 'local-cache'
}

export async function cacheTTSDataUrl(audioUrl: string, userId: string, baseUrl?: string): Promise<CachedAudio | null> {
  const parsed = parseDataUrl(audioUrl)
  if (!parsed) return null

  const config = getAudioCacheConfig()
  await mkdir(config.cacheDir, { recursive: true })

  const id = crypto.randomUUID()
  const extension = extensionForContentType(parsed.contentType)
  const fileName = `${id}.${extension}`
  const metadata: AudioCacheMetadata = {
    id,
    userId,
    accessToken: crypto.randomBytes(32).toString('hex'),
    fileName,
    contentType: parsed.contentType,
    bytes: parsed.buffer.byteLength,
    createdAtMs: Date.now(),
  }

  const filePath = cachePath(config.cacheDir, fileName)
  await writeFile(filePath, parsed.buffer)
  try {
    insertMetadata(config.cacheDir, metadata)
  } catch (error) {
    await rm(filePath, { force: true })
    throw error
  }
  await pruneTTSAudioCache()

  return {
    id,
    audioUrl: buildAudioUrl(id, metadata.accessToken, baseUrl),
  }
}

export async function getCachedTTSAudioForUser(audioId: string, userId: string) {
  if (!idPattern.test(audioId)) return null

  const config = getAudioCacheConfig()
  await mkdir(config.cacheDir, { recursive: true })
  const metadata = getMetadata(config.cacheDir, audioId, userId)
  if (!metadata || metadata.userId !== userId) return null

  const filePath = cachePath(config.cacheDir, metadata.fileName)
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return null
  } catch {
    return null
  }

  return {
    filePath,
    contentType: metadata.contentType,
    bytes: metadata.bytes,
  }
}

export async function getCachedTTSAudioByToken(audioId: string, accessToken: string) {
  if (!idPattern.test(audioId) || !tokenPattern.test(accessToken)) return null

  const config = getAudioCacheConfig()
  await mkdir(config.cacheDir, { recursive: true })
  const metadata = getMetadataByToken(config.cacheDir, audioId, accessToken)
  if (!metadata) return null

  const filePath = cachePath(config.cacheDir, metadata.fileName)
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return null
  } catch {
    return null
  }

  return {
    filePath,
    contentType: metadata.contentType,
    bytes: metadata.bytes,
  }
}

export async function pruneTTSAudioCache() {
  const config = getAudioCacheConfig()
  await mkdir(config.cacheDir, { recursive: true })

  const entries = listMetadata(config.cacheDir)
  const expiresBefore = Date.now() - config.ttlMs
  const retained: AudioCacheMetadata[] = []

  for (const entry of entries) {
    if (!Number.isFinite(entry.createdAtMs) || entry.createdAtMs < expiresBefore) {
      await deleteCachedEntry(config.cacheDir, entry)
    } else {
      retained.push(entry)
    }
  }

  let totalBytes = retained.reduce((sum, entry) => sum + entry.bytes, 0)
  const oldestFirst = retained.sort((a, b) => a.createdAtMs - b.createdAtMs)

  for (const entry of oldestFirst) {
    if (totalBytes <= config.maxBytes) break
    await deleteCachedEntry(config.cacheDir, entry)
    totalBytes -= entry.bytes
  }
}

function getAudioCacheConfig() {
  const cacheDir = process.env.TTS_AUDIO_CACHE_DIR?.trim() || defaultCacheDir
  return {
    cacheDir,
    maxBytes: parsePositiveInteger(process.env.TTS_AUDIO_CACHE_MAX_BYTES, defaultMaxBytes),
    ttlMs: parsePositiveInteger(process.env.TTS_AUDIO_CACHE_TTL_DAYS, defaultTtlDays) * 24 * 60 * 60 * 1000,
  }
}

function parseDataUrl(audioUrl: string) {
  const prefixEnd = audioUrl.indexOf(',')
  if (!audioUrl.startsWith('data:') || prefixEnd < 0) return null

  const metadata = audioUrl.slice(5, prefixEnd)
  const [contentType, encoding] = metadata.split(';')
  if (encoding !== 'base64' || !contentType) return null

  return {
    contentType: normalizeAudioContentType(contentType),
    buffer: Buffer.from(audioUrl.slice(prefixEnd + 1), 'base64'),
  }
}

function normalizeAudioContentType(contentType: string) {
  if (contentType === 'audio/mp3') return 'audio/mpeg'
  return contentType
}

function extensionForContentType(contentType: string) {
  if (contentType === 'audio/mpeg' || contentType === 'audio/mp3') return 'mp3'
  if (contentType === 'audio/wav') return 'wav'
  return 'audio'
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

async function deleteCachedEntry(cacheDir: string, metadata: AudioCacheMetadata) {
  await Promise.all([
    rm(cachePath(cacheDir, metadata.fileName), { force: true }),
  ])
  deleteMetadata(cacheDir, metadata.id)
}

function getDatabase(cacheDir: string) {
  const { DatabaseSync } = requireNodeModule('node:sqlite') as SQLiteModule
  const database = new DatabaseSync(cachePath(cacheDir, databaseFileName))
  database.exec(`
    CREATE TABLE IF NOT EXISTS tts_audio_cache (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tts_audio_cache_user_id ON tts_audio_cache(user_id);
    CREATE INDEX IF NOT EXISTS idx_tts_audio_cache_access_token ON tts_audio_cache(access_token);
    CREATE INDEX IF NOT EXISTS idx_tts_audio_cache_created_at_ms ON tts_audio_cache(created_at_ms);
  `)
  ensureAccessTokenColumn(database)
  return database
}

function insertMetadata(cacheDir: string, metadata: AudioCacheMetadata) {
  const database = getDatabase(cacheDir)
  try {
    database.prepare(`
      INSERT INTO tts_audio_cache (id, user_id, access_token, file_name, content_type, bytes, created_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      metadata.id,
      metadata.userId,
      metadata.accessToken,
      metadata.fileName,
      metadata.contentType,
      metadata.bytes,
      metadata.createdAtMs,
    )
  } finally {
    database.close()
  }
}

function getMetadata(cacheDir: string, audioId: string, userId: string): AudioCacheMetadata | null {
  const database = getDatabase(cacheDir)
  try {
    const row = database.prepare(`
      SELECT id, user_id, access_token, file_name, content_type, bytes, created_at_ms
      FROM tts_audio_cache
      WHERE id = ? AND user_id = ?
    `).get(audioId, userId) as CacheRow | undefined

    return row ? rowToMetadata(row) : null
  } finally {
    database.close()
  }
}

function getMetadataByToken(cacheDir: string, audioId: string, accessToken: string): AudioCacheMetadata | null {
  const database = getDatabase(cacheDir)
  try {
    const row = database.prepare(`
      SELECT id, user_id, access_token, file_name, content_type, bytes, created_at_ms
      FROM tts_audio_cache
      WHERE id = ? AND access_token = ?
    `).get(audioId, accessToken) as CacheRow | undefined

    return row ? rowToMetadata(row) : null
  } finally {
    database.close()
  }
}

function listMetadata(cacheDir: string) {
  const database = getDatabase(cacheDir)
  try {
    const rows = database.prepare(`
      SELECT id, user_id, access_token, file_name, content_type, bytes, created_at_ms
      FROM tts_audio_cache
      ORDER BY created_at_ms ASC
    `).all() as CacheRow[]

    return rows.map(rowToMetadata)
  } finally {
    database.close()
  }
}

function deleteMetadata(cacheDir: string, audioId: string) {
  const database = getDatabase(cacheDir)
  try {
    database.prepare('DELETE FROM tts_audio_cache WHERE id = ?').run(audioId)
  } finally {
    database.close()
  }
}

function rowToMetadata(row: CacheRow): AudioCacheMetadata {
  const fileName = sanitizeCacheFileName(row.file_name)
  if (!fileName || !tokenPattern.test(row.access_token)) {
    throw new Error('Invalid TTS audio cache metadata')
  }

  return {
    id: row.id,
    userId: row.user_id,
    accessToken: row.access_token,
    fileName,
    contentType: row.content_type,
    bytes: row.bytes,
    createdAtMs: row.created_at_ms,
  }
}

function cachePath(cacheDir: string, fileName: string) {
  const normalizedDir = cacheDir.endsWith('/') ? cacheDir.slice(0, -1) : cacheDir
  return `${normalizedDir}/${fileName}`
}

function sanitizeCacheFileName(fileName: string) {
  return /^[a-f0-9-]{36}\.(mp3|wav|audio)$/.test(fileName) ? fileName : null
}

function ensureAccessTokenColumn(database: SQLiteDatabase) {
  const rows = database.prepare('PRAGMA table_info(tts_audio_cache)').all() as Array<{ name?: string }>
  if (rows.some(row => row.name === 'access_token')) return
  database.exec('ALTER TABLE tts_audio_cache ADD COLUMN access_token TEXT NOT NULL DEFAULT ""')
  database.exec('UPDATE tts_audio_cache SET access_token = lower(hex(randomblob(32))) WHERE access_token = ""')
  database.exec('CREATE INDEX IF NOT EXISTS idx_tts_audio_cache_access_token ON tts_audio_cache(access_token)')
}

function buildAudioUrl(audioId: string, accessToken: string, requestBaseUrl?: string) {
  const path = `/api/tts/audio/${audioId}?token=${accessToken}`
  const baseUrl = requestBaseUrl?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  if (!baseUrl) return path
  return `${baseUrl.replace(/\/$/, '')}${path}`
}
