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
}

export type AuthRequestMode = 'public' | 'protected'

/** @deprecated Use AuthRequestMode — kept so existing imports keep compiling. */
export type RequestMode = AuthRequestMode

type RequestOptions = Omit<RequestInit, 'mode'> & {
  /**
   * Auth transport mode (not Fetch CORS `RequestInit.mode`).
   * public = cookie only; protected = cookie + Bearer JWT
   */
  authMode: AuthRequestMode
  /** Internal flag — do not set from call sites */
  _authRetried?: boolean
}

const TOKEN_AUTH_ERROR_CODES = new Set([
  'MISSING_BEARER',
  'INVALID_TOKEN',
  'INVALID_CLAIMS',
  'UNKNOWN_SCOPE',
  'TOKEN_PERMISSIONS_STALE',
])

function isTokenAuthError(error: ApiError): boolean {
  if (error.status !== 401) return false
  if (error.code && TOKEN_AUTH_ERROR_CODES.has(error.code)) return true
  // Some middleware paths return 401 without a stable code.
  return !error.code || /token|bearer|unauthorized|jwt/i.test(error.message)
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
      errors?: Array<{ message?: string; field?: string }>
    }

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

/**
 * After a failed remint, refresh the shared Better Auth session once.
 * Prefer authClient over raw fetch so useSession subscribers update and
 * fetchOptions.onSuccess can still capture set-auth-jwt.
 */
async function refreshSessionCookieBootstrap() {
  try {
    await authClient.getSession({ query: { disableCookieCache: true } })
  } catch {
    /* ignore — caller surfaces the original auth error */
  }
}

async function request<T>(
  path: string,
  init: RequestOptions
): Promise<{ data: T; response: Response }> {
  const { authMode, _authRetried, ...fetchInit } = init
  const headers = new Headers(fetchInit.headers)

  if (fetchInit.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (authMode === 'protected') {
    const token = await getValidAccessToken()
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...fetchInit,
    headers,
    credentials: 'include',
  })

  applyAuthTokenHeaders(response)

  if (!response.ok) {
    const error = await parseError(response)

    if (authMode === 'protected' && !_authRetried && isTokenAuthError(error)) {
      try {
        clearAccessToken()
        await forceRemintAccessToken()
        return request<T>(path, { ...init, _authRetried: true })
      } catch {
        clearAccessToken()
        await refreshSessionCookieBootstrap()
        throw error
      }
    }

    throw error
  }

  if (response.status === 204) {
    return { data: undefined as T, response }
  }

  const text = await response.text()
  const data = (text ? JSON.parse(text) : undefined) as T

  return { data, response }
}

function publicRequest<T>(path: string, init: RequestInit = {}) {
  return request<T>(path, { ...init, authMode: 'public' })
}

function protectedRequest<T>(path: string, init: RequestInit = {}) {
  return request<T>(path, { ...init, authMode: 'protected' })
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

export type InboxConversationStatus = 'open' | 'pending' | 'closed'

export type InboxConversationContact = {
  id: string
  name: string | null
  phone: string
  phoneNormalized?: string
  email?: string | null
  company?: string | null
}

/** Row from GET /api/v1/inbox/conversations */
export type InboxConversation = {
  id: string
  organizationId: string
  whatsappConfigId: string
  contactId: string
  status: InboxConversationStatus | string
  assignedAgentId: string | null
  lastMessageText: string | null
  lastMessageAt: string | null
  firstResponseAt?: string | null
  closedAt?: string | null
  unreadCount: number
  createdAt: string
  updatedAt?: string | null
  contact: InboxConversationContact
}

export type CreateInboxConversationBody = {
  contactId: string
  whatsappConfigId: string
}

export type ListInboxConversationsParams = {
  status?: InboxConversationStatus
  assignedAgentId?: string
  search?: string
  page?: number
  limit?: number
}

export type InboxMessageDirection = 'inbound' | 'outbound'

export type InboxMessageSender = {
  type: string
  id: string | null
  name: string | null
}

/** Row from GET /api/v1/inbox/conversations/:id/messages */
export type InboxMessage = {
  id: string
  organizationId: string
  conversationId: string
  senderType: string
  senderId: string | null
  direction: InboxMessageDirection
  contentType: string
  contentText: string | null
  mediaUrl: string | null
  mediaAssetId: string | null
  status: string
  providerMessageId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string | null
  sender: InboxMessageSender
}

export type ListInboxMessagesParams = {
  page?: number
  limit?: number
}

export type SendInboxMessageBody = {
  contentType: 'text'
  contentText: string
}

export type AssignInboxConversationBody = {
  assignedAgentId: string
}

export type UpdateInboxConversationBody = {
  status: InboxConversationStatus
}

export type InboxConversationNoteAuthor = {
  id: string
  name: string | null
  email: string | null
}

/** Row from GET/POST /api/v1/inbox/conversations/:id/notes */
export type InboxConversationNote = {
  id: string
  conversationId: string
  organizationId: string
  noteText: string
  createdBy: InboxConversationNoteAuthor
  createdAt: string
  updatedAt: string | null
}

export type CreateInboxConversationNoteBody = {
  noteText: string
}

export type WhatsappConfigSummary = {
  id: string
  organizationId?: string
  phoneNumberId: string
  displayPhoneNumber?: string | null
  wabaId?: string | null
  status: 'connected' | 'disconnected' | 'error' | string
  connectedAt?: string | null
  registeredAt?: string | null
  subscribedAppsAt?: string | null
  createdByUserId?: string | null
  createdAt?: string
  updatedAt?: string | null
}

export type WhatsappEmbeddedSignupSession = {
  appId: string
  configId: string
  graphVersion: string
}

export type CompleteWhatsappEmbeddedSignupBody = {
  code: string
  wabaId: string
  phoneNumberId: string
  businessId?: string
}

export type TestWhatsappConfigBody = {
  to: string
  templateName?: string
  languageCode?: string
}

export type TestWhatsappConfigResult = {
  messageId?: string | null
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
  'accept_invitation' | 'create_organization' | 'select_organization' | 'ready'

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

/** Row from GET /api/v1/super-admin/organizations */
export type SuperAdminOrganization = {
  id: string
  name: string
  slug: string
  email: string
  phone?: string | null
  website?: string | null
  industry?: string | null
  country: string
  timezone: string
  currency?: string | null
  /** Backend boolean: true = active, false = inactive */
  status: boolean
  createdAt: string
  updatedAt?: string | null
  deletedAt?: string | null
}

export type UpdateSuperAdminOrganizationBody = {
  name?: string
  phone?: string
  website?: string
  industry?: string
  timezone?: string
  currency?: string
}

export type SuperAdminSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled'

/** Row from GET /api/v1/super-admin/subscriptions */
export type SuperAdminSubscription = {
  id: string
  organizationId: string
  planId: string
  status: SuperAdminSubscriptionStatus | string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAt?: string | null
  createdAt?: string
  updatedAt?: string | null
}

export type CreateSuperAdminSubscriptionBody = {
  organizationId: string
  planId: string
  status: SuperAdminSubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAt?: string
}

export type UpdateSuperAdminSubscriptionBody = {
  planId?: string
  status?: SuperAdminSubscriptionStatus
  currentPeriodStart?: string
  currentPeriodEnd?: string
  cancelAt?: string | null
}

export const api = {
  auth: {
    signup: (body: SignupBody) =>
      publicRequest<{ status: string }>('/api/v1/auth/pre-signup', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    login: (body: LoginBody) =>
      publicRequest('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    verifyOtp: (body: { email: string; otp: string; password: string }) =>
      publicRequest('/api/v1/auth/verify-signup', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    resendOtp: (body: { email: string }) =>
      publicRequest<{ status: string }>('/api/v1/auth/pre-signup/resend', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    forgotPassword: (body: { email: string; redirectTo?: string }) =>
      publicRequest('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({
          email: body.email,
          redirectTo: body.redirectTo ?? `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
        }),
      }),

    resetPassword: (body: { token: string; newPassword: string }) =>
      publicRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    google: (callbackURL?: string) =>
      publicRequest<{ url?: string; redirect?: boolean }>('/api/auth/sign-in/social', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'google',
          callbackURL: callbackURL ?? `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/organization`,
        }),
      }),

    logout: () =>
      publicRequest('/api/auth/sign-out', {
        method: 'POST',
      }),

    getSession: () =>
      publicRequest<{ user: ProfileUser | null; session: unknown } | null>(
        '/api/auth/get-session',
        {
          method: 'GET',
          // Keep invite/login UIs responsive if the auth service is slow.
          signal: AbortSignal.timeout(4000),
        }
      ),
  },

  account: {
    profile: () =>
      protectedRequest<{ data?: ProfileUser } & ProfileUser>('/api/v1/account/profile', {
        method: 'GET',
      }),
  },

  /** Post-auth routing — no active organization required. */
  onboarding: {
    state: () =>
      protectedRequest<{ data?: OnboardingState } & OnboardingState>('/api/v1/onboarding/state', {
        method: 'GET',
      }),
  },

  organizations: {
    create: (body: CreateOrganizationBody) =>
      protectedRequest<{ data?: CreatedOrganization } & CreatedOrganization>(
        '/api/v1/organizations',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    list: () =>
      protectedRequest<{ data?: OrganizationSummary[] } | OrganizationSummary[]>(
        '/api/v1/organizations',
        {
          method: 'GET',
        }
      ),

    setActive: (organizationId: string) =>
      protectedRequest<{ data?: { organizationId: string } } & { organizationId: string }>(
        `/api/v1/organizations/${organizationId}/set-active`,
        { method: 'POST' }
      ),

    update: (organizationId: string, body: UpdateOrganizationBody) =>
      protectedRequest<{ data?: OrganizationDetails } & OrganizationDetails>(
        `/api/v1/organizations/${organizationId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        }
      ),

    destroy: (organizationId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/organizations/${organizationId}`,
        { method: 'DELETE' }
      ),
  },

  access: {
    /** Active organization + permissions for the current session. */
    context: () =>
      protectedRequest<{ data?: AccessContext } & AccessContext>('/api/v1/access-context', {
        method: 'GET',
      }),
  },

  contacts: {
    list: () =>
      protectedRequest<{ data?: ContactSummary[] } | ContactSummary[]>('/api/v1/contacts', {
        method: 'GET',
      }),

    create: (body: CreateContactBody) =>
      protectedRequest<{ data?: ContactSummary } & ContactSummary>('/api/v1/contacts', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  inbox: {
    listConversations: (params: ListInboxConversationsParams = {}) => {
      const qs = new URLSearchParams()
      if (params.status) qs.set('status', params.status)
      if (params.assignedAgentId) qs.set('assignedAgentId', params.assignedAgentId)
      if (params.search?.trim()) qs.set('search', params.search.trim())
      if (params.page != null) qs.set('page', String(params.page))
      if (params.limit != null) qs.set('limit', String(params.limit))
      const query = qs.toString()
      return protectedRequest<
        Paginated<InboxConversation> | { data?: InboxConversation[]; meta?: PaginationMeta }
      >(`/api/v1/inbox/conversations${query ? `?${query}` : ''}`, {
        method: 'GET',
      })
    },

    createConversation: (body: CreateInboxConversationBody) =>
      protectedRequest<{ data?: InboxConversation } & InboxConversation>(
        '/api/v1/inbox/conversations',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    getConversation: (conversationId: string) =>
      protectedRequest<{ data?: InboxConversation } & InboxConversation>(
        `/api/v1/inbox/conversations/${conversationId}`,
        { method: 'GET' }
      ),

    listMessages: (conversationId: string, params: ListInboxMessagesParams = {}) => {
      const qs = new URLSearchParams()
      if (params.page != null) qs.set('page', String(params.page))
      if (params.limit != null) qs.set('limit', String(params.limit))
      const query = qs.toString()
      return protectedRequest<
        Paginated<InboxMessage> | { data?: InboxMessage[]; meta?: PaginationMeta }
      >(`/api/v1/inbox/conversations/${conversationId}/messages${query ? `?${query}` : ''}`, {
        method: 'GET',
      })
    },

    sendMessage: (
      conversationId: string,
      body: SendInboxMessageBody,
      idempotencyKey: string
    ) =>
      protectedRequest<{ data?: InboxMessage } & InboxMessage>(
        `/api/v1/inbox/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        }
      ),

    assignConversation: (conversationId: string, body: AssignInboxConversationBody) =>
      protectedRequest<{ data?: InboxConversation } & InboxConversation>(
        `/api/v1/inbox/conversations/${conversationId}/assign`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    closeConversation: (conversationId: string) =>
      protectedRequest<{ data?: InboxConversation } & InboxConversation>(
        `/api/v1/inbox/conversations/${conversationId}/close`,
        { method: 'POST' }
      ),

    reopenConversation: (conversationId: string) =>
      protectedRequest<{ data?: InboxConversation } & InboxConversation>(
        `/api/v1/inbox/conversations/${conversationId}/reopen`,
        { method: 'POST' }
      ),

    updateConversation: (conversationId: string, body: UpdateInboxConversationBody) =>
      protectedRequest<{ data?: InboxConversation } & InboxConversation>(
        `/api/v1/inbox/conversations/${conversationId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        }
      ),

    listNotes: (conversationId: string) =>
      protectedRequest<{ data?: InboxConversationNote[] } | InboxConversationNote[]>(
        `/api/v1/inbox/conversations/${conversationId}/notes`,
        { method: 'GET' }
      ),

    createNote: (conversationId: string, body: CreateInboxConversationNoteBody) =>
      protectedRequest<{ data?: InboxConversationNote } & InboxConversationNote>(
        `/api/v1/inbox/conversations/${conversationId}/notes`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
  },

  whatsapp: {
    listConfigs: () =>
      protectedRequest<{ data?: WhatsappConfigSummary[] } | WhatsappConfigSummary[]>(
        '/api/v1/whatsapp/configs',
        { method: 'GET' }
      ),

    getConfig: (configId: string) =>
      protectedRequest<{ data?: WhatsappConfigSummary } & WhatsappConfigSummary>(
        `/api/v1/whatsapp/configs/${configId}`,
        { method: 'GET' }
      ),

    disconnectConfig: (configId: string) =>
      protectedRequest<{ data?: WhatsappConfigSummary } & WhatsappConfigSummary>(
        `/api/v1/whatsapp/configs/${configId}`,
        { method: 'DELETE' }
      ),

    testConfig: (configId: string, body: TestWhatsappConfigBody) =>
      protectedRequest<{ data?: TestWhatsappConfigResult } & TestWhatsappConfigResult>(
        `/api/v1/whatsapp/configs/${configId}/test`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    getEmbeddedSignupSession: () =>
      protectedRequest<{ data?: WhatsappEmbeddedSignupSession } & WhatsappEmbeddedSignupSession>(
        '/api/v1/whatsapp/embedded-signup/session',
        { method: 'GET' }
      ),

    completeEmbeddedSignup: (body: CompleteWhatsappEmbeddedSignupBody) =>
      protectedRequest<{ data?: WhatsappConfigSummary } & WhatsappConfigSummary>(
        '/api/v1/whatsapp/embedded-signup/complete',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
  },

  members: {
    list: () =>
      protectedRequest<{ data?: OrganizationMember[] } | OrganizationMember[]>('/api/v1/members', {
        method: 'GET',
      }),

    assignRole: (memberId: string, role: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/members/${memberId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        }
      ),

    remove: (memberId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
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
      return protectedRequest<
        Paginated<OrganizationAdminUser> | { data?: OrganizationAdminUser[]; meta?: PaginationMeta }
      >(`/api/v1/organization-admin/users${query ? `?${query}` : ''}`, {
        method: 'GET',
      })
    },
  },

  invitations: {
    create: (organizationId: string, body: CreateInvitationBody) =>
      protectedRequest<{ data?: CreatedInvitation } & CreatedInvitation>(
        `/api/v1/organizations/${organizationId}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    list: () =>
      protectedRequest<{ data?: PendingInvitation[] } | PendingInvitation[]>(
        '/api/v1/invitations',
        { method: 'GET' }
      ),

    /** Public preview — invitation id is the secret. */
    get: (invitationId: string) =>
      publicRequest<{ data?: InvitationPreview } & InvitationPreview>(
        `/api/v1/invitations/${invitationId}`,
        { method: 'GET' }
      ),

    accept: (invitationId: string) =>
      protectedRequest<{ data?: { organizationId: string } } & { organizationId: string }>(
        `/api/v1/invitations/${invitationId}/accept`,
        { method: 'POST' }
      ),

    reject: (invitationId: string) =>
      publicRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/invitations/${invitationId}/reject`,
        {
          method: 'POST',
          // Local DB can be slow on first hit; keep UI from hanging forever.
          signal: AbortSignal.timeout(15000),
        }
      ),

    cancel: (invitationId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/invitations/${invitationId}/cancel`,
        { method: 'POST' }
      ),
  },

  roles: {
    list: () =>
      protectedRequest<{ data?: OrganizationRole[] } | OrganizationRole[]>('/api/v1/roles', {
        method: 'GET',
      }),

    create: (body: CreateRoleBody) =>
      protectedRequest<{ data?: { role: string } } & { role: string }>('/api/v1/roles', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    preview: (roleKey: string, body: { permissions: string[] }) =>
      protectedRequest<{ data?: RoleUpdatePreview } & RoleUpdatePreview>(
        `/api/v1/roles/${encodeURIComponent(roleKey)}/preview`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    update: (roleKey: string, body: UpdateRoleBody) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/roles/${encodeURIComponent(roleKey)}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        }
      ),

    reset: (roleKey: string, body: ResetRoleBody) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/roles/${encodeURIComponent(roleKey)}/reset`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    destroy: (roleKey: string, body: DeleteRoleBody) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/roles/${encodeURIComponent(roleKey)}`,
        {
          method: 'DELETE',
          body: JSON.stringify(body),
        }
      ),
  },

  superAdmin: {
    organizations: {
      list: (params: { page?: number; perPage?: number } = {}) => {
        const qs = new URLSearchParams()
        if (params.page != null) qs.set('page', String(params.page))
        if (params.perPage != null) qs.set('perPage', String(params.perPage))
        const query = qs.toString()
        return protectedRequest<
          | Paginated<SuperAdminOrganization>
          | { data?: SuperAdminOrganization[]; meta?: PaginationMeta }
        >(`/api/v1/super-admin/organizations${query ? `?${query}` : ''}`, {
          method: 'GET',
        })
      },

      update: (organizationId: string, body: UpdateSuperAdminOrganizationBody) =>
        protectedRequest<{ data?: SuperAdminOrganization } & SuperAdminOrganization>(
          `/api/v1/super-admin/organizations/${organizationId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          }
        ),

      destroy: (organizationId: string) =>
        protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
          `/api/v1/super-admin/organizations/${organizationId}`,
          { method: 'DELETE' }
        ),
    },

    subscriptions: {
      list: (params: { page?: number; perPage?: number } = {}) => {
        const qs = new URLSearchParams()
        if (params.page != null) qs.set('page', String(params.page))
        if (params.perPage != null) qs.set('perPage', String(params.perPage))
        const query = qs.toString()
        return protectedRequest<
          | Paginated<SuperAdminSubscription>
          | { data?: SuperAdminSubscription[]; meta?: PaginationMeta }
        >(`/api/v1/super-admin/subscriptions${query ? `?${query}` : ''}`, {
          method: 'GET',
        })
      },

      get: (subscriptionId: string) =>
        protectedRequest<{ data?: SuperAdminSubscription } & SuperAdminSubscription>(
          `/api/v1/super-admin/subscriptions/${subscriptionId}`,
          { method: 'GET' }
        ),

      create: (body: CreateSuperAdminSubscriptionBody) =>
        protectedRequest<{ data?: SuperAdminSubscription } & SuperAdminSubscription>(
          '/api/v1/super-admin/subscriptions',
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        ),

      update: (subscriptionId: string, body: UpdateSuperAdminSubscriptionBody) =>
        protectedRequest<{ data?: SuperAdminSubscription } & SuperAdminSubscription>(
          `/api/v1/super-admin/subscriptions/${subscriptionId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          }
        ),

      destroy: (subscriptionId: string) =>
        protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
          `/api/v1/super-admin/subscriptions/${subscriptionId}`,
          { method: 'DELETE' }
        ),
    },
  },
}
