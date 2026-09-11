import { createTuyau, TuyauHTTPError, TuyauNetworkError } from '@tuyau/core/client'
import { registry } from 'backend/registry'
import { getBaseUrl } from '@/lib/api-base'
import {
  applyAuthTokenHeaders,
  clearAccessToken,
  forceRemintAccessToken,
  getValidAccessToken,
} from '@/lib/access-token'
import { authClient } from '@/lib/auth-client'

export type ApiError = {
  message: string
  status: number
  code?: string
  retryAfter?: number
  chunkCount?: number
  details?: Record<string, unknown>
}

const TOKEN_AUTH_ERROR_CODES = new Set([
  'MISSING_BEARER',
  'INVALID_TOKEN',
  'INVALID_CLAIMS',
  'UNKNOWN_SCOPE',
  'TOKEN_PERMISSIONS_STALE',
])

type ErrorBody = {
  message?: string
  error?: string | { message?: string; code?: string }
  code?: string
  details?: Record<string, unknown>
  retryAfter?: number
  chunkCount?: number
  errors?: Array<{ message?: string; field?: string }>
}

function tuyauBaseUrl(): string {
  const configured = getBaseUrl()
  // Empty origin must stay same-origin `/api/...` so the Next rewrite still applies.
  // Ky rejects an empty prefixUrl and would otherwise resolve relative to the page.
  return configured || '/'
}

function isTokenAuthError(error: ApiError): boolean {
  if (error.status !== 401) return false
  if (error.code && TOKEN_AUTH_ERROR_CODES.has(error.code)) return true
  return !error.code || /token|bearer|unauthorized|jwt/i.test(error.message)
}

function isOrgPaymentRequired(error: ApiError): boolean {
  return error.status === 402 && error.code === 'E_ORG_PAYMENT_REQUIRED'
}

function isOrgWhatsappRequired(error: ApiError): boolean {
  return error.status === 403 && error.code === 'E_ORG_WHATSAPP_REQUIRED'
}

function redirectToOnboardingPlan() {
  if (typeof window === 'undefined') return
  const { pathname } = window.location
  if (
    pathname.includes('/onboarding/plan') ||
    pathname.includes('/onboarding/payment') ||
    pathname.includes('/onboarding/organization') ||
    pathname.includes('/onboarding/')
  ) {
    return
  }
  const parts = pathname.split('/').filter(Boolean)
  const maybeLocale = parts[0]
  const locale = maybeLocale && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(maybeLocale) ? maybeLocale : 'en'
  window.location.assign(`/${locale}/onboarding/plan`)
}

function redirectToWhatsappConnect() {
  if (typeof window === 'undefined') return
  const { pathname } = window.location
  if (pathname.includes('/dashboard/whatsapp')) return
  const parts = pathname.split('/').filter(Boolean)
  const maybeLocale = parts[0]
  const locale = maybeLocale && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(maybeLocale) ? maybeLocale : 'en'
  window.location.assign(`/${locale}/dashboard/whatsapp`)
}

async function refreshSessionCookieBootstrap() {
  try {
    await authClient.getSession({ query: { disableCookieCache: true } })
  } catch {
    /* ignore — caller surfaces the original auth error */
  }
}

function readRetryAfter(body: ErrorBody | undefined, response?: Response): number | undefined {
  if (typeof body?.retryAfter === 'number') return body.retryAfter
  const header = response?.headers.get('Retry-After')
  if (!header) return undefined
  const parsed = Number(header)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** Same field extraction as the previous `parseError` in api.ts. */
export function parseErrorBody(body: unknown, response?: Response): ApiError {
  const status = response?.status ?? 0
  let message = response?.statusText || 'Request failed'
  let code: string | undefined
  let details: Record<string, unknown> | undefined
  let chunkCount: number | undefined

  const data = (typeof body === 'string' ? tryParseJson(body) : body) as ErrorBody | undefined
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string') {
      message = data.message
    } else if (typeof data.error === 'string') {
      message = data.error
    } else if (data.error && typeof data.error === 'object' && data.error.message) {
      message = data.error.message
    } else if (Array.isArray(data.errors) && data.errors.length > 0) {
      message = data.errors
        .map((item) => item.message)
        .filter((item): item is string => Boolean(item))
        .join(' ')
    }

    code =
      data.code ??
      (typeof data.error === 'object' && data.error?.code ? data.error.code : undefined)

    if (!code && /already exists/i.test(message)) {
      code = 'EMAIL_ALREADY_EXISTS'
    }

    if (data.details && typeof data.details === 'object') {
      details = data.details
    }

    if (typeof data.chunkCount === 'number') {
      chunkCount = data.chunkCount
    }
  }

  return {
    message,
    status,
    code,
    retryAfter: readRetryAfter(data, response),
    chunkCount,
    details,
  }
}

function tryParseJson(value: string): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export async function parseResponseError(response: Response): Promise<ApiError> {
  try {
    return parseErrorBody(await response.json(), response)
  } catch {
    return parseErrorBody(undefined, response)
  }
}

function normalizeSuccessBody(data: unknown, status: number): unknown {
  if (status === 204 || data === '' || data == null) return undefined
  if (typeof data === 'string') {
    return data ? (tryParseJson(data) ?? data) : undefined
  }
  return data
}

type CallOptions = {
  hooks?: {
    afterResponse?: Array<
      (request: Request, options: unknown, response: Response) => Response | Promise<Response>
    >
  }
  headers?: HeadersInit
  signal?: AbortSignal
}

const sharedKy = {
  retry: 0,
  timeout: false as const,
  credentials: 'include' as const,
  headers: { Accept: 'application/json' },
}

/**
 * Tuyau always adds `X-XSRF-TOKEN` when that cookie exists. The previous fetch
 * client never sent it. Strip it so protected calls do not gain a header.
 */
function fetchWithoutTuyauCsrf(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init)
  if (!request.headers.has('X-XSRF-TOKEN')) return fetch(request)
  const headers = new Headers(request.headers)
  headers.delete('X-XSRF-TOKEN')
  return fetch(new Request(request, { headers }))
}

function createClient(mode: 'public' | 'protected') {
  return createTuyau({
    registry,
    baseUrl: tuyauBaseUrl(),
    fetch: fetchWithoutTuyauCsrf,
    ...sharedKy,
    hooks: {
      beforeRequest: [
        async (request) => {
          if (mode !== 'protected') return
          const token = await getValidAccessToken()
          request.headers.set('Authorization', `Bearer ${token}`)
        },
      ],
      afterResponse: [
        async (_request, _options, response) => {
          applyAuthTokenHeaders(response)
          return response
        },
      ],
    },
  })
}

export const publicTuyau = createClient('public')
export const protectedTuyau = createClient('protected')

async function execute<T>(
  mode: 'public' | 'protected',
  run: (options: CallOptions) => Promise<T>,
  retried: boolean
): Promise<{ data: T; response: Response }> {
  let captured: Response | undefined
  try {
    const data = await run({
      hooks: {
        afterResponse: [
          async (_request, _options, response) => {
            captured = response
            return response
          },
        ],
      },
    })
    const response = captured ?? new Response(null, { status: 200 })
    return { data: normalizeSuccessBody(data, response.status) as T, response }
  } catch (error) {
    if (error instanceof TuyauNetworkError) {
      throw error.cause ?? error
    }

    const http = error instanceof TuyauHTTPError ? error : null
    const response = http?.rawResponse ?? captured
    const apiError = http
      ? parseErrorBody(http.response, response)
      : {
          message: error instanceof Error ? error.message : 'Request failed',
          status: response?.status ?? 0,
        }

    if (mode === 'protected' && !retried && isTokenAuthError(apiError)) {
      try {
        clearAccessToken()
        await forceRemintAccessToken()
        return execute(mode, run, true)
      } catch {
        clearAccessToken()
        await refreshSessionCookieBootstrap()
        throw apiError
      }
    }

    if (mode === 'protected' && isOrgPaymentRequired(apiError)) {
      redirectToOnboardingPlan()
    }
    if (mode === 'protected' && isOrgWhatsappRequired(apiError)) {
      redirectToWhatsappConnect()
    }

    throw apiError
  }
}

export function callPublic<T>(run: (options: CallOptions) => Promise<T>) {
  return execute('public', run, false)
}

export function callProtected<T>(run: (options: CallOptions) => Promise<T>) {
  return execute('protected', run, false)
}

/** Keep `api.*` return types stable while the Tuyau body type differs from page DTOs. */
export function callPublicAs<T>(run: (options: CallOptions) => Promise<unknown>) {
  return callPublic(run) as Promise<{ data: T; response: Response }>
}

export function callProtectedAs<T>(run: (options: CallOptions) => Promise<unknown>) {
  return callProtected(run) as Promise<{ data: T; response: Response }>
}

export type { CallOptions }

/** Better Auth and other non-registry JSON paths (cookie only, no remint). */
export async function publicJsonRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T; response: Response }> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  const response = await fetch(`${tuyauBaseUrl().replace(/\/$/, '')}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  applyAuthTokenHeaders(response)

  if (!response.ok) {
    throw await parseResponseError(response)
  }

  if (response.status === 204) {
    return { data: undefined as T, response }
  }

  const text = await response.text()
  const data = (text ? (tryParseJson(text) ?? text) : undefined) as T
  return { data, response }
}

/** Invoice PDF and other binary downloads (Bearer + cookies, no JSON parse). */
export async function protectedBlobRequest(
  path: string,
  init: RequestInit = {}
): Promise<{ blob: Blob; response: Response }> {
  const headers = new Headers(init.headers)
  const token = await getValidAccessToken()
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${tuyauBaseUrl().replace(/\/$/, '')}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  applyAuthTokenHeaders(response)

  if (!response.ok) {
    throw await parseResponseError(response)
  }

  return { blob: await response.blob(), response }
}

/** Drop unset query keys the old URLSearchParams builders omitted. */
export function definedQuery<T extends Record<string, unknown>>(query: T): Partial<T> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    if (typeof value === 'string' && value === '') continue
    next[key] = value
  }
  return next as Partial<T>
}
