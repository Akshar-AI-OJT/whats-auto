function getBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_URL
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_URL is not set')
  }
  return base
}

export type ApiError = {
  message: string
  status: number
  code?: string
  retryAfter?: number
}

async function parseError(response: Response): Promise<ApiError> {
  let message = response.statusText || 'Request failed'
  let code: string | undefined
  let retryAfter: number | undefined

  try {
    const data = (await response.json()) as {
      message?: string
      error?: string | { message?: string; code?: string }
      code?: string
      retryAfter?: number
    }

    if (typeof data.message === 'string') {
      message = data.message
    } else if (typeof data.error === 'string') {
      message = data.error
    } else if (data.error && typeof data.error === 'object' && data.error.message) {
      message = data.error.message
    }

    code =
      data.code ??
      (typeof data.error === 'object' && data.error?.code ? data.error.code : undefined)

    if (!code && /already exists/i.test(message)) {
      code = 'EMAIL_ALREADY_EXISTS'
    }

    if (typeof data.retryAfter === 'number') {
      retryAfter = data.retryAfter
    } else {
      const header = response.headers.get('Retry-After')
      if (header) {
        const parsed = Number(header)
        if (!Number.isNaN(parsed)) retryAfter = parsed
      }
    }
  } catch {
    // non-JSON body — keep statusText
  }

  return { message, status: response.status, code, retryAfter }
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T; response: Response }> {
  const headers = new Headers(init.headers)

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return { data: undefined as T, response }
  }

  const text = await response.text()
  const data = (text ? JSON.parse(text) : undefined) as T

  return { data, response }
}

export type SignupBody = {
  firstname: string
  lastname: string
  email: string
  password: string
}

export type LoginBody = {
  email: string
  password: string
}

export type ProfileUser = {
  id: string
  name: string
  firstname: string
  lastname: string
  email: string
  initials: string
  createdAt: string | null
  updatedAt: string | null
}

export const api = {
  auth: {
    signup: (body: SignupBody) =>
      request<{ status: string }>('/api/v1/auth/pre-signup', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    login: (body: LoginBody) =>
      request('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    verifyOtp: (body: { email: string; otp: string; password: string }) =>
      request('/api/v1/auth/verify-signup', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    resendOtp: (body: { email: string }) =>
      request<{ status: string }>('/api/v1/auth/pre-signup/resend', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    forgotPassword: (body: { email: string; redirectTo?: string }) =>
      request('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({
          email: body.email,
          redirectTo:
            body.redirectTo ?? `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
        }),
      }),

    resetPassword: (body: { token: string; newPassword: string }) =>
      request('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    google: (callbackURL?: string) =>
      request<{ url?: string; redirect?: boolean }>('/api/auth/sign-in/social', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'google',
          callbackURL: callbackURL ?? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        }),
      }),

    logout: () =>
      request('/api/auth/sign-out', {
        method: 'POST',
      }),

    getSession: () =>
      request<{ user: ProfileUser | null; session: unknown } | null>('/api/auth/get-session', {
        method: 'GET',
      }),
  },

  account: {
    profile: () =>
      request<{ data?: ProfileUser } & ProfileUser>('/api/v1/account/profile', {
        method: 'GET',
      }),
  },
}
