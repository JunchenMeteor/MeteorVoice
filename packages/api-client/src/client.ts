import type {
  ApiClientOptions,
  ApiErrorBody,
  ApiHeadersProvider,
  CreateSessionRequest,
  CreateSessionResponse,
  CreateTurnRequest,
  CreateTurnResponse,
  GenerateCoachReplyRequest,
  GenerateCoachReplyResponse,
  GenerateSummaryRequest,
  GenerateSummaryResponse,
  ListAccentsResponse,
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

export class MeteorVoiceApiClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly headers?: ApiHeadersProvider

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, '') ?? ''
    this.fetchImpl = options.fetch ?? fetch
    this.headers = options.headers
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

  createTurn(input: CreateTurnRequest) {
    return this.request<CreateTurnResponse>('/api/turns', {
      method: 'POST',
      body: input,
    })
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}) {
    const headers = new Headers(await this.resolveHeaders())
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await this.fetchImpl(this.toUrl(path), {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const body = await readJson(response)

    if (!response.ok) {
      const message = isApiErrorBody(body) ? body.error : `Request failed with status ${response.status}`
      throw new MeteorVoiceApiError(message, response.status, body)
    }

    return body as T
  }

  private toUrl(path: string) {
    if (/^https?:\/\//.test(path)) return path
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  }

  private async resolveHeaders() {
    return typeof this.headers === 'function' ? await this.headers() : this.headers
  }
}

export function createMeteorVoiceApiClient(options?: ApiClientOptions) {
  return new MeteorVoiceApiClient(options)
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
