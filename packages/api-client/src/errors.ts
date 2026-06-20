/**
 * API error formatting — 7 error kinds + 7 presentation modes.
 * API 错误格式化 — 7 种错误类型 + 7 种展示模式。
 */
import { MeteorVoiceApiError, MeteorVoiceApiTimeoutError } from './client'

export type ApiRequestErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'server'
  | 'timeout'
  | 'network'
  | 'unknown'

export type ApiRequestErrorPresentation =
  | 'inline'
  | 'toast'
  | 'alert'
  | 'banner'
  | 'sheet'
  | 'blocking'
  | 'silent'
export type ApiRequestErrorSeverity = 'info' | 'warning' | 'error'
export type ApiRequestErrorAction = 'sign_in' | 'retry' | 'none'

export type ApiRequestErrorDetails = {
  kind: ApiRequestErrorKind
  title: string
  displayMessage: string
  presentation: ApiRequestErrorPresentation
  severity: ApiRequestErrorSeverity
  action: ApiRequestErrorAction
  actionLabel?: string
  autoDismissMs?: number
  blocksInteraction: boolean
  dismissible: boolean
  shouldDisplay: boolean
  logData: Record<string, unknown>
  status?: number
}

export type FormatApiRequestErrorOptions = {
  context: string
  presentation?: ApiRequestErrorPresentation
}

/**
 * Reads and validates a JSON response, throwing MeteorVoiceApiError if the response is not OK.
 * 读取并验证 JSON 响应，如果响应状态不是 OK 则抛出 MeteorVoiceApiError。
 */
export async function readApiJsonResponse<T>(response: Response, fallbackMessage = 'Request failed'): Promise<T> {
  const body = await readResponseJson(response)
  if (!response.ok) {
    const message = isApiErrorBody(body) ? body.error : `${fallbackMessage}: ${response.status}`
    throw new MeteorVoiceApiError(message, response.status, body)
  }
  return body as T
}

/**
 * Formats any error (MeteorVoiceApiError, timeout, network, or unknown) into a structured ApiRequestErrorDetails object.
 * 将任意错误（MeteorVoiceApiError、超时、网络或未知错误）格式化为结构化的 ApiRequestErrorDetails 对象。
 */
export function formatApiRequestError(
  error: unknown,
  options: string | FormatApiRequestErrorOptions,
): ApiRequestErrorDetails {
  const context = typeof options === 'string' ? options : options.context
  const presentation = typeof options === 'string' ? 'inline' : options.presentation ?? 'inline'
  const presentationConfig = getPresentationConfig(presentation)

  if (error instanceof MeteorVoiceApiError) {
    const kind = getApiErrorKind(error.status)
    const display = getApiDisplay(kind)
    return {
      kind,
      status: error.status,
      title: display.title,
      displayMessage: display.message,
      presentation,
      severity: display.severity,
      action: display.action,
      actionLabel: display.actionLabel,
      ...presentationConfig,
      logData: {
        context,
        kind,
        status: error.status,
        message: error.message,
      },
    }
  }

  if (error instanceof MeteorVoiceApiTimeoutError) {
    return {
      kind: 'timeout',
      title: 'Request timed out',
      displayMessage: 'The request took too long. Try again.',
      presentation,
      severity: 'warning',
      action: 'retry',
      actionLabel: 'Try again',
      ...presentationConfig,
      logData: {
        context,
        kind: 'timeout',
        timeoutMs: error.timeoutMs,
        message: error.message,
      },
    }
  }

  if (error instanceof TypeError) {
    return {
      kind: 'network',
      title: 'Network unavailable',
      displayMessage: 'Network request failed. Check the connection and try again.',
      presentation,
      severity: 'warning',
      action: 'retry',
      actionLabel: 'Try again',
      ...presentationConfig,
      logData: {
        context,
        kind: 'network',
        message: error.message,
      },
    }
  }

  const message = error instanceof Error ? error.message : 'Request failed'
  return {
    kind: 'unknown',
    title: 'Request failed',
    displayMessage: message,
    presentation,
    severity: 'error',
    action: 'none',
    ...presentationConfig,
    logData: {
      context,
      kind: 'unknown',
      message,
    },
  }
}

async function readResponseJson(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function isApiErrorBody(body: unknown): body is { error: string } {
  return Boolean(
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'string',
  )
}

function getApiErrorKind(status: number): ApiRequestErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server'
  return 'unknown'
}

function getApiDisplay(kind: ApiRequestErrorKind) {
  if (kind === 'unauthorized') {
    return {
      title: 'Sign in required',
      message: 'Sign in again and try this request.',
      severity: 'warning' as const,
      action: 'sign_in' as const,
      actionLabel: 'Sign in',
    }
  }
  if (kind === 'forbidden') {
    return {
      title: 'Request blocked',
      message: 'This request was blocked. Try again later.',
      severity: 'warning' as const,
      action: 'none' as const,
    }
  }
  if (kind === 'rate_limited') {
    return {
      title: 'Too many requests',
      message: 'Wait a moment and try again.',
      severity: 'warning' as const,
      action: 'retry' as const,
      actionLabel: 'Try again',
    }
  }
  if (kind === 'server') {
    return {
      title: 'Service unavailable',
      message: 'Service is temporarily unavailable. Try again later.',
      severity: 'error' as const,
      action: 'retry' as const,
      actionLabel: 'Try again',
    }
  }
  return {
    title: 'Request failed',
    message: 'Request failed. Try again later.',
    severity: 'error' as const,
    action: 'none' as const,
  }
}

function getPresentationConfig(presentation: ApiRequestErrorPresentation) {
  if (presentation === 'toast') {
    return {
      autoDismissMs: 4000,
      blocksInteraction: false,
      dismissible: true,
      shouldDisplay: true,
    }
  }
  if (presentation === 'alert') {
    return {
      blocksInteraction: true,
      dismissible: true,
      shouldDisplay: true,
    }
  }
  if (presentation === 'banner') {
    return {
      blocksInteraction: false,
      dismissible: true,
      shouldDisplay: true,
    }
  }
  if (presentation === 'sheet') {
    return {
      blocksInteraction: true,
      dismissible: true,
      shouldDisplay: true,
    }
  }
  if (presentation === 'blocking') {
    return {
      blocksInteraction: true,
      dismissible: false,
      shouldDisplay: true,
    }
  }
  if (presentation === 'silent') {
    return {
      blocksInteraction: false,
      dismissible: false,
      shouldDisplay: false,
    }
  }
  return {
    blocksInteraction: false,
    dismissible: false,
    shouldDisplay: true,
  }
}
