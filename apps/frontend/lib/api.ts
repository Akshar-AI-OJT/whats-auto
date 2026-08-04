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

export type CreateOrganizationBody = {
  name: string
  slug: string
  email: string
  phone?: string
  website?: string
  industry?: string
  country: string
  timezone: string
  currency?: string
}

export type CreatedOrganization = {
  id: string
  name: string
  slug: string
  role: string
}

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  email: string
  phone?: string | null
  website?: string | null
  industry?: string | null
  country?: string
  timezone?: string
  currency?: string | null
  role: string
  createdAt: string
}

export type UpdateOrganizationBody = {
  name?: string
  phone?: string
  website?: string
  industry?: string
  timezone?: string
  currency?: string
}

export type OrganizationDetails = {
  id: string
  name: string
  slug: string
  email: string
  phone: string | null
  website: string | null
  industry: string | null
  country: string
  timezone: string
  currency: string | null
}

export type AccessContext = {
  organizationId: string
  organizationName: string
  memberId: string
  role: string
  displayName: string
  isOwner: boolean
  permissions: string[]
}

export type ContactSummary = {
  id: string
  organizationId: string
  phone: string
  phoneNormalized: string
  name: string | null
  email: string | null
  company: string | null
  customFields?: Record<string, unknown>
  createdByUserId?: string | null
  createdAt: string
  updatedAt?: string | null
}

export type CreateContactBody = {
  phone: string
  name?: string
  email?: string
  company?: string
}

export type WhatsappConfigSummary = {
  id: string
  phoneNumberId: string
  displayPhoneNumber?: string | null
  status: string
}

export type CreateInvitationBody = {
  email: string
  role: string
}

export type CreatedInvitation = {
  id: string
  email: string
  role?: string
  status: string
  expiresAt?: string
}

export type InvitationPreview = {
  id: string
  organizationName: string
  role: string
  inviterName: string
  email: string
  status: string
}

export type OrganizationMember = {
  id: string
  userId: string
  role: string
  email: string
  name: string
  createdAt?: string
}

/** Row from GET /api/v1/organization-admin/users (id = userId). */
export type OrganizationAdminUser = {
  id: string
  name: string
  firstname?: string | null
  lastname?: string | null
  email: string
  isActive?: boolean
  memberId: string
  role: string
  createdAt?: string
  updatedAt?: string
}

export type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage?: number
}

export type Paginated<T> = {
  data: T[]
  meta: PaginationMeta
}

export type ListOrganizationAdminUsersParams = {
  page?: number
  perPage?: number
}

export type PendingInvitation = {
  id: string
  email: string
  role: string
  inviterName: string
  createdAt: string
  expiresAt: string
}

/** Row from GET /api/v1/onboarding/state pendingInvitations. */
export type OnboardingPendingInvitation = {
  id: string
  organizationId?: string
  organizationName: string
  role: string
  inviterName: string
  expiresAt: string
}

export type OnboardingNextStep =
  | 'accept_invitation'
  | 'create_organization'
  | 'select_organization'
  | 'ready'

export type OnboardingState = {
  activeOrganizationId: string | null
  organizations: Array<{ id: string; name: string; role?: string }>
  pendingInvitations: OnboardingPendingInvitation[]
  nextStep: OnboardingNextStep
}

export type OrganizationRole = {
  role: string
  isSystem: boolean
  hasOverrides: boolean
  permissions: string[]
}

export type CreateRoleBody = {
  name: string
  permissions: string[]
}

export type UpdateRoleBody = {
  permissions: string[]
  reason: string
}

export type DeleteRoleBody = {
  replacementRole: string
  reason: string
}

export type ResetRoleBody = {
  reason: string
}

export type RoleUpdatePreview = {
  role: string
  isSystem: boolean
  permissionsAdded: string[]
  permissionsRemoved: string[]
  affectedMembers: Array<{ id: string; userId: string }>
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
          redirectTo: body.redirectTo ?? `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
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
          callbackURL: callbackURL ?? `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/organization`,
        }),
      }),

    logout: () =>
      request('/api/auth/sign-out', {
        method: 'POST',
      }),

    getSession: () =>
      request<{ user: ProfileUser | null; session: unknown } | null>('/api/auth/get-session', {
        method: 'GET',
        // Keep invite/login UIs responsive if the auth service is slow.
        signal: AbortSignal.timeout(4000),
      }),
  },

  account: {
    profile: () =>
      request<{ data?: ProfileUser } & ProfileUser>('/api/v1/account/profile', {
        method: 'GET',
      }),
  },

  /** Post-auth routing — no active organization required. */
  onboarding: {
    state: () =>
      request<{ data?: OnboardingState } & OnboardingState>('/api/v1/onboarding/state', {
        method: 'GET',
      }),
  },

  organizations: {
    create: (body: CreateOrganizationBody) =>
      request<{ data?: CreatedOrganization } & CreatedOrganization>('/api/v1/organizations', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    list: () =>
      request<{ data?: OrganizationSummary[] } | OrganizationSummary[]>('/api/v1/organizations', {
        method: 'GET',
      }),

    setActive: (organizationId: string) =>
      request<{ data?: { organizationId: string } } & { organizationId: string }>(
        `/api/v1/organizations/${organizationId}/set-active`,
        { method: 'POST' }
      ),

    update: (organizationId: string, body: UpdateOrganizationBody) =>
      request<{ data?: OrganizationDetails } & OrganizationDetails>(
        `/api/v1/organizations/${organizationId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        }
      ),

    destroy: (organizationId: string) =>
      request<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/organizations/${organizationId}`,
        { method: 'DELETE' }
      ),
  },

  access: {
    /** Active organization + permissions for the current session. */
    context: () =>
      request<{ data?: AccessContext } & AccessContext>('/api/v1/access-context', {
        method: 'GET',
      }),
  },

  contacts: {
    list: () =>
      request<{ data?: ContactSummary[] } | ContactSummary[]>('/api/v1/contacts', {
        method: 'GET',
      }),

    create: (body: CreateContactBody) =>
      request<{ data?: ContactSummary } & ContactSummary>('/api/v1/contacts', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  whatsapp: {
    listConfigs: () =>
      request<{ data?: WhatsappConfigSummary[] } | WhatsappConfigSummary[]>(
        '/api/v1/whatsapp/configs',
        { method: 'GET' }
      ),
  },

  members: {
    list: () =>
      request<{ data?: OrganizationMember[] } | OrganizationMember[]>(
        '/api/v1/members',
        { method: 'GET' }
      ),

    assignRole: (memberId: string, role: string) =>
      request<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/members/${memberId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        }
      ),

    remove: (memberId: string) =>
      request<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/members/${memberId}`,
        { method: 'DELETE' }
      ),
  },

  organizationAdmin: {
    /**
     * Paginated org users — Owner/Admin only.
     * Role changes still go through PATCH /api/v1/members/:memberId/role.
     */
    listUsers: (params: ListOrganizationAdminUsersParams = {}) => {
      const qs = new URLSearchParams()
      if (params.page != null) qs.set('page', String(params.page))
      if (params.perPage != null) qs.set('perPage', String(params.perPage))
      const query = qs.toString()
      return request<
        | Paginated<OrganizationAdminUser>
        | { data?: OrganizationAdminUser[]; meta?: PaginationMeta }
      >(`/api/v1/organization-admin/users${query ? `?${query}` : ''}`, {
        method: 'GET',
      })
    },
  },

  invitations: {
    create: (organizationId: string, body: CreateInvitationBody) =>
      request<{ data?: CreatedInvitation } & CreatedInvitation>(
        `/api/v1/organizations/${organizationId}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    list: () =>
      request<{ data?: PendingInvitation[] } | PendingInvitation[]>(
        '/api/v1/invitations',
        { method: 'GET' }
      ),

    /** Public preview — invitation id is the secret. */
    get: (invitationId: string) =>
      request<{ data?: InvitationPreview } & InvitationPreview>(
        `/api/v1/invitations/${invitationId}`,
        { method: 'GET' }
      ),

    accept: (invitationId: string) =>
      request<{ data?: { organizationId: string } } & { organizationId: string }>(
        `/api/v1/invitations/${invitationId}/accept`,
        { method: 'POST' }
      ),

    reject: (invitationId: string) =>
      request<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/invitations/${invitationId}/reject`,
        {
          method: 'POST',
          // Local DB can be slow on first hit; keep UI from hanging forever.
          signal: AbortSignal.timeout(15000),
        }
      ),

    cancel: (invitationId: string) =>
      request<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/invitations/${invitationId}/cancel`,
        { method: 'POST' }
      ),
  },

  roles: {
    list: () =>
      request<{ data?: OrganizationRole[] } | OrganizationRole[]>('/api/v1/roles', {
        method: 'GET',
      }),

    create: (body: CreateRoleBody) =>
      request<{ data?: { role: string } } & { role: string }>('/api/v1/roles', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    preview: (roleKey: string, body: { permissions: string[] }) =>
      request<{ data?: RoleUpdatePreview } & RoleUpdatePreview>(
        `/api/v1/roles/${encodeURIComponent(roleKey)}/preview`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    update: (roleKey: string, body: UpdateRoleBody) =>
      request<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/roles/${encodeURIComponent(roleKey)}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        }
      ),

    reset: (roleKey: string, body: ResetRoleBody) =>
      request<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/roles/${encodeURIComponent(roleKey)}/reset`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    destroy: (roleKey: string, body: DeleteRoleBody) =>
      request<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/roles/${encodeURIComponent(roleKey)}`,
        {
          method: 'DELETE',
          body: JSON.stringify(body),
        }
      ),
  },
}
