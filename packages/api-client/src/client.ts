/**
 * Typed HTTP API client with exponential backoff retry.
 * 类型化 HTTP API 客户端（指数退避重试）。
 */
import type {
  ApiClientOptions,
  ApiErrorBody,
  ApiHeadersProvider,
  ApiUnauthorizedHandler,
  CreateASRSessionRequest,
  CreateASRSessionResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  CreateTurnRequest,
  CreateTurnResponse,
  DeleteSessionResponse,
  GenerateCoachReplyRequest,
  GenerateCoachReplyResponse,
  GenerateSummaryRequest,
  GenerateSummaryResponse,
  ListAccentsResponse,
  ListASRProvidersResponse,
  ListHistoryResponse,
  ListScenariosResponse,
  ListSessionTurnsResponse,
  PreferencesResponse,
  SynthesizeSpeechRequest,
  SynthesizeSpeechResponse,
  SyncSessionRequest,
  SyncSessionResponse,
  UpdateSessionStatusRequest,
  UpdateSessionStatusResponse,
  UpdatePreferencesRequest,
  UpdatePreferencesResponse,
} from './types'

export class MeteorVoiceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'MeteorVoiceApiError'
  }
}

export class MeteorVoiceApiTimeoutError extends Error {
  constructor(
    message: string,
    readonly timeoutMs: number,
  ) {
    super(message)
    this.name = 'MeteorVoiceApiTimeoutError'
  }
}

const defaultRequestTimeoutMs = 15000

export class MeteorVoiceApiClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly headers?: ApiHeadersProvider
  private readonly onUnauthorized?: ApiUnauthorizedHandler
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, '') ?? ''
    this.fetchImpl = options.fetch ?? fetch
    this.headers = options.headers
    this.onUnauthorized = options.onUnauthorized
    this.timeoutMs = options.timeoutMs ?? defaultRequestTimeoutMs
    this.maxRetries = options.maxRetries ?? 2
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500
  }

  getPreferences() {
    return this.request<PreferencesResponse>('/api/preferences')
  }

  updatePreferences(input: UpdatePreferencesRequest) {
    return this.request<UpdatePreferencesResponse>('/api/preferences', {
      method: 'PATCH',
      body: input,
    })
  }

  generateCoachReply(input: GenerateCoachReplyRequest) {
    return this.request<GenerateCoachReplyResponse>('/api/chat', {
      method: 'POST',
      body: input,
    })
  }

  listScenarios(locale?: 'en' | 'zh') {
    const query = locale ? `?locale=${encodeURIComponent(locale)}` : ''
    return this.request<ListScenariosResponse>(`/api/scenarios${query}`)
  }

  listAccents(input: { locale?: 'en' | 'zh'; provider?: string } = {}) {
    const params = new URLSearchParams()
    if (input.locale) params.set('locale', input.locale)
    if (input.provider) params.set('provider', input.provider)
    const query = params.toString()
    return this.request<ListAccentsResponse>(`/api/accents${query ? `?${query}` : ''}`)
  }

  synthesizeSpeech(input: SynthesizeSpeechRequest) {
    return this.request<SynthesizeSpeechResponse>('/api/tts', {
      method: 'POST',
      body: input,
    })
  }

  listASRProviders() {
    return this.request<ListASRProvidersResponse>('/api/asr/providers')
  }

  createASRSession(input: CreateASRSessionRequest) {
    return this.request<CreateASRSessionResponse>('/api/asr/session', {
      method: 'POST',
      body: input,
    })
  }

  syncSession(input: SyncSessionRequest) {
    return this.request<SyncSessionResponse>('/api/session/sync', {
      method: 'POST',
      body: input,
    })
  }

  createSession(input: CreateSessionRequest = {}) {
    return this.request<CreateSessionResponse>('/api/session', {
      method: 'POST',
      body: input,
    })
  }

  updateSessionStatus(input: UpdateSessionStatusRequest) {
    return this.request<UpdateSessionStatusResponse>('/api/session', {
      method: 'PATCH',
      body: input,
    })
  }

  generateSummary(input: GenerateSummaryRequest) {
    return this.request<GenerateSummaryResponse>('/api/summary', {
      method: 'POST',
      body: input,
    })
  }

  listHistory() {
    return this.request<ListHistoryResponse>('/api/history')
  }

  listSessionTurns(sessionId: string) {
    return this.request<ListSessionTurnsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/turns`)
  }

  deleteSession(sessionId: string) {
    return this.request<DeleteSessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
  }

  createTurn(input: CreateTurnRequest) {
    return this.request<CreateTurnResponse>('/api/turns', {
      method: 'POST',
      body: input,
    })
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}) {
    const headers = new Headers(await this.resolveHeaders())
    if (!headers.has('X-MeteorVoice-Client')) {
      headers.set('X-MeteorVoice-Client', 'meteorvoice-api-client')
    }
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const fetchInit: RequestInit = {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(this.fetchImpl, this.toUrl(path), fetchInit, this.timeoutMs)
        const body = await readJson(response)

        if (!response.ok) {
          const message = isApiErrorBody(body) ? body.error : `Request failed with status ${response.status}`
          if (response.status === 401) {
            await this.onUnauthorized?.()
          }
          const error = new MeteorVoiceApiError(message, response.status, body)
          if (attempt < this.maxRetries && isRetryableStatus(response.status)) {
            lastError = error
            await retryDelay(this.retryBaseDelayMs, attempt)
            continue
          }
          throw error
        }

        return body as T
      } catch (error) {
        if (error instanceof MeteorVoiceApiError) throw error
        if (attempt < this.maxRetries && isRetryableError(error)) {
          lastError = error
          await retryDelay(this.retryBaseDelayMs, attempt)
          continue
        }
        throw error
      }
    }

    throw lastError
  }

  private toUrl(path: string) {
    if (/^https?:\/\//.test(path)) return path
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  }

  private async resolveHeaders() {
    return typeof this.headers === 'function' ? await this.headers() : this.headers
  }
}

/**
 * Creates a new MeteorVoice API client instance configured with the given options.
 * 创建一个使用给定选项配置的 MeteorVoice API 客户端实例。
 */
export function createMeteorVoiceApiClient(options?: ApiClientOptions) {
  return new MeteorVoiceApiClient(options)
}

/**
 * Fetches a resource with an abort-controller timeout, throwing MeteorVoiceApiTimeoutError on timeout or abort.
 * 使用 AbortController 超时机制进行 fetch 请求，超时或中止时抛出 MeteorVoiceApiTimeoutError。
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = defaultRequestTimeoutMs,
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return fetchImpl(input, init)
  }

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut || isAbortError(error)) {
      throw new MeteorVoiceApiTimeoutError('Network request timed out', timeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function readJson(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof (value as ApiErrorBody).error === 'string',
  )
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504
}

function isRetryableError(error: unknown) {
  if (error instanceof MeteorVoiceApiTimeoutError) return true
  if (error instanceof TypeError) return true
  return false
}

function retryDelay(baseDelayMs: number, attempt: number) {
  const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs
  return new Promise<void>(resolve => setTimeout(resolve, delay))
}
