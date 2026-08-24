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
  let chunkCount: number | undefined

  try {
    const data = (await response.json()) as {
      message?: string
      error?: string | { message?: string; code?: string }
      code?: string
      retryAfter?: number
      chunkCount?: number
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

    if (typeof data.chunkCount === 'number') {
      chunkCount = data.chunkCount
    }
  } catch {
    // non-JSON body — keep statusText
  }

  return { message, status: response.status, code, retryAfter, chunkCount }
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

/**
 * Like protectedRequest but returns the raw Blob instead of parsing JSON.
 * Used for binary downloads (PDF, etc.) that carry a Bearer token.
 */
async function protectedBlobRequest(
  path: string,
  init: RequestInit = {}
): Promise<{ blob: Blob; response: Response }> {
  const headers = new Headers(init.headers)
  const token = await getValidAccessToken()
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  applyAuthTokenHeaders(response)

  if (!response.ok) {
    const error = await parseError(response)
    throw error
  }

  const blob = await response.blob()
  return { blob, response }
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

export type OrganizationType = 'company' | 'partnership' | 'sole_proprietorship' | 'other'

export type CreateOrganizationBody = {
  name: string
  slug: string
  email: string
  phone: string
  website?: string
  industry?: string
  organizationType: OrganizationType
  address: string
  pan: string
  gstin?: string
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
  organizationType?: OrganizationType | null
  address?: string | null
  pan?: string | null
  gstin?: string | null
  country: string
  timezone: string
  currency?: string | null
  role: string
  createdAt: string
}

export type UpdateOrganizationBody = {
  name?: string
  phone?: string
  website?: string
  industry?: string
  organizationType?: OrganizationType
  address?: string
  pan?: string
  gstin?: string
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
  organizationType: OrganizationType | null
  address: string | null
  pan: string | null
  gstin: string | null
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

export type CustomerGroupSummary = {
  id: string
  name: string
  color?: string | null
  status?: string
  createdAt?: string
}

export type CreateContactBody = {
  phoneNumber: string
  countryCode?: string
  name?: string
  email?: string
  company?: string
}

/**
 * UI model for Customer Groups. Backed by `/api/v1/tags` — see `api.tags`
 * and `customer-group-service.ts`. Fields the Tags API does not persist
 * (description, status, type, campaign usage) stay as UI defaults.
 */
export type CustomerGroupStatus = 'active' | 'inactive'

/** Only Static groups are supported in this frontend version. */
export type CustomerGroupType = 'static'

export type CustomerGroup = {
  id: string
  organizationId: string
  name: string
  description: string
  type: CustomerGroupType
  status: CustomerGroupStatus
  contactIds: string[]
  contactCount: number
  /** Campaign usage is not returned by Tags. `null` means not available. */
  usedInCampaigns: number | null
  createdAt: string
  updatedAt: string | null
}

export type CampaignPreview = {
  campaignId: string
  campaignName: string
  campaignStatus?: string
  messageTemplateId?: string
  templateName?: string
  templateStatus?: string
  category?: string
  language?: string | null
  headerType?: string | null
  headerContent?: string | null
  headerMediaUrl?: string | null
  variables?: Record<string, string>
  bodyPreview: string
  headerPreview?: string | null
  footerPreview?: string | null
  footerText?: string | null
  buttons?: unknown
}

/** Raw `/api/v1/tags` record. */
export type TagRecord = {
  id: string
  organizationId: string
  createdByUserId: string | null
  name: string
  color: string | null
  createdAt: string
  contactCount: number
}

export type TagAssignmentRecord = {
  id: string
  organizationId: string
  tagId: string
  contactId: string
}

export type CreateTagBody = {
  name: string
  color?: string | null
}

export type UpdateTagBody = {
  name?: string
  color?: string | null
}

export type AssignTagContactBody = {
  contactId: string
}

export type CustomerGroupSummaryStats = {
  totalGroups: number
  totalContacts: number
  usedInCampaigns: number | null
  engagementRate: number | null
}

export type ListCustomerGroupsParams = {
  search?: string
  status?: CustomerGroupStatus | 'all'
}

export type CreateCustomerGroupBody = {
  name: string
  description?: string
  status?: CustomerGroupStatus
  contactIds?: string[]
}

export type UpdateCustomerGroupBody = {
  name?: string
  description?: string
  status?: CustomerGroupStatus
  contactIds?: string[]
}

export type AddCustomerGroupContactsBody = {
  contactIds: string[]
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
  aiMode?: InboxAiMode | string
  aiHandoverReason?: string | null
  contact: InboxConversationContact
}

export type InboxAiMode = 'AI_AUTO' | 'HANDOVER' | 'HUMAN_ACTIVE'

export type InboxAiHandoverReason =
  | 'low_confidence'
  | 'keyword_match'
  | 'business_exception'

export type InboxAiModePatch = {
  id: string
  aiMode: InboxAiMode | string
  aiHandoverReason: string | null
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
  contentType: 'text' | 'image' | 'document' | 'template'
  contentText?: string
  mediaAssetId?: string
  templateId?: string
  templateParameters?: Record<string, string>
  headerMediaAssetId?: string
}

export type MediaAssetKind = 'image' | 'document'

export type MediaAsset = {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  state: string
  source: string
  deliveryUrl: string
  uploadedAt: string
  createdAt: string
  kind: MediaAssetKind
  referenceCount?: number
}

export type MediaQuota = {
  readyBytes: number
  reservedBytes: number
  usedBytes: number
  limitBytes: number
}

export type ListMediaParams = {
  page?: number
  perPage?: number
  kind?: MediaAssetKind
  state?: 'ready' | 'deleted'
  search?: string
}

export type InitiateMediaUploadBody = {
  fileName: string
  mimeType: string
  fileSize: number
}

export type InitiateMediaUploadResult = {
  asset: MediaAsset
  upload: {
    method: 'PUT'
    url: string
    headers: Record<string, string>
    expiresInSeconds: number
  }
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

/** Row from GET /api/v1/notifications */
export type Notification = {
  id: string
  organizationId: string
  userId: string
  type: string
  conversationId: string | null
  contactId: string | null
  actorUserId: string | null
  title: string
  body: string | null
  readAt: string | null
  createdAt: string
}

export type ListNotificationsParams = {
  page?: number
  limit?: number
}

export type MarkAllNotificationsReadResult = {
  updatedCount: number
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

export type IntegrationConnection = {
  id: string
  organizationId: string
  provider: string
  externalAccountId: string | null
  displayName: string
  config: Record<string, unknown>
  status: string
  lastSyncAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: string
  updatedAt: string | null
}

export type UpsertIntegrationConnectionBody = {
  displayName: string
  externalAccountId?: string | null
  config?: Record<string, unknown>
}

export type IntegrationApiKey = {
  id: string
  organizationId: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  secretToken?: string
}

export type CreateIntegrationApiKeyBody = {
  name: string
  scopes?: Array<'events:write'>
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

export type WhatsappTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

export type WhatsappTemplateHeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'

export type WhatsappTemplateStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'deleted'
  | 'paused'
  | 'disabled'
  | string

export type WhatsappTemplateParameterSchema = {
  headerNames?: string[]
  bodyNames?: string[]
  urlButtons?: Array<{ name: string; index: number }>
  sendable?: boolean
  unsupportedReason?: string | null
  headerMediaType?: 'image' | 'document'
  parameterFormat?: 'named' | 'positional'
}

export type WhatsappTemplateButton = {
  type?: string
  text?: string
  url?: string
  phone_number?: string
  [key: string]: unknown
}

export type WhatsappMessageTemplate = {
  id: string
  organizationId?: string
  whatsappConfigId?: string | null
  createdByUserId?: string | null
  name: string
  category: WhatsappTemplateCategory | string
  language: string | null
  headerType?: WhatsappTemplateHeaderType | string | null
  headerContent?: string | null
  headerMediaUrl?: string | null
  bodyText: string
  footerText?: string | null
  buttons?: WhatsappTemplateButton[] | null
  sampleValues?: Record<string, unknown> | unknown
  parameterSchema?: WhatsappTemplateParameterSchema | null
  status: WhatsappTemplateStatus
  metaTemplateId?: string | null
  rejectionReason?: string | null
  qualityScore?: string | null
  submissionError?: string | null
  lastSubmittedAt?: string | null
  createdAt?: string
  updatedAt?: string | null
}

export type ListWhatsappTemplatesParams = {
  page?: number
  perPage?: number
  status?: string
  category?: string
  search?: string
}

export type CreateWhatsappTemplateBody = {
  name: string
  category: WhatsappTemplateCategory | string
  language: string
  headerType?: WhatsappTemplateHeaderType | string
  headerContent?: string
  headerMediaAssetId?: string
  headerMediaUrl?: string
  bodyText: string
  footerText?: string
  buttons?: WhatsappTemplateButton[]
  sampleValues?: Record<string, unknown> | unknown
}

export type SyncWhatsappTemplatesResult = {
  syncedCount: number
}

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled'
  | string

/** Maps a template parameter to a contact field, custom field, or static value. */
export type CampaignVariableMapping =
  | { source: 'contact_field'; field: string }
  | { source: 'custom_field'; field: string }
  | { source: 'static'; value: string }

export type CampaignVariableMappings = Record<string, CampaignVariableMapping>

export type Campaign = {
  id: string
  organizationId: string
  createdByUserId?: string | null
  name: string
  whatsappConfigId?: string | null
  messageTemplateId?: string | null
  headerMediaAssetId?: string | null
  audienceTagId?: string | null
  scheduledAt?: string | null
  finalizedAt?: string | null
  cancelledAt?: string | null
  status: CampaignStatus
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  readCount: number
  repliedCount?: number
  failedCount: number
  /** Named template param → source mapping (resolved into recipient.variables on send). */
  variableMappings?: CampaignVariableMappings | null
  createdAt?: string
  updatedAt?: string | null
}

export type ListCampaignsParams = {
  page?: number
  limit?: number
  perPage?: number
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export type CreateCampaignBody = {
  name: string
  whatsappConfigId?: string
  messageTemplateId?: string
  headerMediaAssetId?: string
  scheduledAt?: string
  status?: 'draft' | 'scheduled'
  variableMappings?: CampaignVariableMappings
}

export type UpdateCampaignBody = {
  name?: string
  whatsappConfigId?: string | null
  messageTemplateId?: string | null
  headerMediaAssetId?: string | null
  scheduledAt?: string | null
  status?: 'draft' | 'scheduled'
  variableMappings?: CampaignVariableMappings | null
}

export type ReplaceCampaignRecipientsBody = {
  contactIds?: string[]
  tagId?: string
  variables?: Record<string, string>
}
export type CampaignPreview = {
  campaignId: string
  campaignName: string
  messageTemplateId: string
  templateName: string
  templateStatus: string
  category?: string
  language?: string | null
  bodyPreview: string
  headerType?: string | null
  headerContent?: string | null
  headerMediaUrl?: string | null
  footerText?: string | null
  variables: Record<string, string>
  buttons?: unknown
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

/** POST /api/v1/ownership/transfer */
export type TransferOwnershipBody = {
  targetMemberId: string
  replacementRoleForCurrentOwner: string
  reason: string
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

/** PATCH /api/v1/organization-admin/users/:id */
export type UpdateOrganizationAdminUserBody = {
  firstname?: string
  lastname?: string
  email?: string
  isActive?: boolean
}

/** Row from GET /api/v1/audit */
export type AuthorizationAuditEvent = {
  id: string
  actorUserId: string | null
  actorName?: string | null
  actorEmail?: string | null
  roleId?: string | null
  targetType: string
  targetId: string | null
  eventType: string
  granted?: boolean | null
  before: unknown
  after: unknown
  reason: string | null
  createdAt: string | Date
  organizationId?: string | null
  organizationName?: string | null
}

export type ListAuditParams = {
  /** 1–100, backend default 50 */
  limit?: number
  /** Super Admin platform list only — omit for platform-wide events. */
  organizationId?: string
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

/** Nested org membership from GET /api/v1/super-admin/platform-users */
export type SuperAdminPlatformUserOrganization = {
  memberId: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationStatus: boolean
  role: string
  roleId: string
}

/** Row from GET /api/v1/super-admin/platform-users */
export type SuperAdminPlatformUser = {
  id: string
  name: string
  firstname: string
  lastname: string
  email: string
  isActive: boolean
  status: 'active' | 'inactive'
  emailVerified: boolean
  createdAt: string
  updatedAt: string | null
  platformRole: 'superadmin' | null
  organizations: SuperAdminPlatformUserOrganization[]
}

export type ListSuperAdminPlatformUsersParams = {
  page?: number
  perPage?: number
  search?: string
  status?: 'active' | 'inactive' | 'all'
  organizationId?: string
  role?: string
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
  organizationType?: OrganizationType | null
  address?: string | null
  pan?: string | null
  gstin?: string | null
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
  organizationType?: OrganizationType
  address?: string
  pan?: string
  gstin?: string
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

/** Row from GET /api/v1/super-admin/ai-config (no API keys). */
export type PlatformAiConfig = {
  id: string
  isEnabled: boolean
  chatProvider: 'openai' | 'google' | 'mistral' | string
  chatModel: string
  summaryModel: string | null
  modelName: string
  temperature: number
  campaignAttributionWindowHours: number
  minConfidenceScore: number
  debounceDelaySeconds: number
  systemPrompt: string | null
  handoverKeywords: string[]
  workingSetSize: number
  summaryTurnThreshold: number
  embeddingProvider: 'openai' | 'google' | 'mistral' | string
  embeddingModel: string
  activeEmbeddingSpaceId?: string
  maxOutputTokens: number
  reindexStatus?: 'idle' | 'running' | 'failed'
  reindexFromSpaceId?: string | null
  reindexToSpaceId?: string | null
  reindexEmbeddingModel?: string | null
  reindexEmbeddingProvider?: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string | null
}

export type UpdatePlatformAiConfigBody = {
  isEnabled?: boolean
  chatProvider?: string
  chatModel?: string
  summaryModel?: string | null
  modelName?: string
  temperature?: number
  campaignAttributionWindowHours?: number
  minConfidenceScore?: number
  debounceDelaySeconds?: number
  systemPrompt?: string | null
  handoverKeywords?: string[]
  workingSetSize?: number
  summaryTurnThreshold?: number
  embeddingProvider?: string
  embeddingModel?: string
  maxOutputTokens?: number
  confirmReindex?: boolean
}

export type KnowledgeDocumentStatus = 'PENDING' | 'PROCESSING' | 'INDEXED' | 'FAILED'

export type KnowledgeDocumentSourceType = 'FILE_PDF' | 'FILE_DOCX' | 'FILE_TXT'

export type KnowledgeDocument = {
  id: string
  title: string
  sourceType: KnowledgeDocumentSourceType | string
  status: KnowledgeDocumentStatus | string
  chunkCount: number
  mediaAssetId: string | null
  embeddingModel: string
  documentHash: string | null
  errorMessage: string | null
  deletedAt?: string | null
  createdAt: string
  updatedAt: string | null
}

export type ListKnowledgeDocumentsParams = {
  page?: number
  perPage?: number
  status?: KnowledgeDocumentStatus
  lifecycle?: 'active' | 'deleted'
}

export type CreateKnowledgeDocumentBody = {
  title: string
  sourceType: 'FILE_PDF' | 'FILE_DOCX' | 'FILE_TXT'
  fileName: string
  mimeType: string
  fileSize: number
}

export type KnowledgeDocumentPresignedUpload = {
  method: 'PUT'
  url: string
  headers: Record<string, string>
  expiresInSeconds: number
}

export type CreateKnowledgeDocumentResult = {
  document: KnowledgeDocument
  upload?: KnowledgeDocumentPresignedUpload
}

export type UpdateSuperAdminSubscriptionBody = {
  planId?: string
  status?: SuperAdminSubscriptionStatus
  currentPeriodStart?: string
  currentPeriodEnd?: string
  cancelAt?: string | null
}

export type SuperAdminInvoiceStatus = 'paid' | 'pending' | 'overdue' | 'cancelled'

export type SuperAdminInvoiceBillingPeriod = 'monthly' | 'yearly' | 'custom'

export type SuperAdminInvoiceLineItem = {
  id: string
  description: string
  detail?: string | null
  quantity: number
  unitPrice: number
  amount: number
}

export type SuperAdminInvoiceOrganization = {
  id: string
  name: string
  email: string
  phone?: string | null
  address?: string | null
  gstin?: string | null
}

/** Row from GET /api/v1/super-admin/invoices/:id */
export type SuperAdminInvoice = {
  id: string
  invoiceNumber: string
  organization: SuperAdminInvoiceOrganization
  planName: string
  billingPeriod: SuperAdminInvoiceBillingPeriod
  periodStart: string
  periodEnd: string
  status: SuperAdminInvoiceStatus
  issueDate: string
  dueDate: string
  currency: string
  lineItems: SuperAdminInvoiceLineItem[]
  subtotal: number
  tax: number
  taxRate: number
  discount: number
  total: number
  notes?: string | null
  paymentMethod?: string | null
  transactionId?: string | null
  paymentDate?: string | null
  organizationId: string
  subscriptionId?: string | null
  planId?: string | null
  paymentTransactionId?: string | null
  sourceInvoiceId?: string | null
  createdAt: string
  updatedAt: string | null
}

export type SuperAdminInvoiceSummary = {
  totalCount: number
  paidCount: number
  paidAmount: number
  pendingCount: number
  pendingAmount: number
  overdueCount: number
  overdueAmount: number
  cancelledCount: number
  cancelledAmount: number
  thisMonthCount: number
  thisMonthAmount: number
}

export type ListSuperAdminInvoicesParams = {
  page?: number
  perPage?: number
  search?: string
  status?: SuperAdminInvoiceStatus | 'all'
  issueMonth?: string | 'all'
  billingPeriod?: SuperAdminInvoiceBillingPeriod | 'all'
}

export type CreateSuperAdminInvoiceBody = {
  organizationId: string
  subscriptionId?: string
  planId?: string
  organizationName: string
  organizationEmail: string
  organizationPhone?: string
  organizationAddress?: string
  organizationGstin?: string
  planName: string
  billingPeriod: SuperAdminInvoiceBillingPeriod
  periodStart: string
  periodEnd: string
  issueDate: string
  dueDate: string
  currency?: string
  taxRate?: number
  discount?: number
  notes?: string
  lineItems: Array<{
    description: string
    detail?: string
    quantity: number
    unitPrice: number
    amount: number
  }>
}

export type MarkSuperAdminInvoicePaidBody = {
  paymentMethod?: string
  paymentTransactionId?: string
}

/** Super-admin SaaS plan catalog (GET/POST/PATCH/DELETE /api/v1/super-admin/plans) */
export type SuperAdminPlanStatus = 'active' | 'draft' | 'archived'
export type SuperAdminPlanBillingPeriod = 'monthly' | 'yearly' | 'custom'

export type SuperAdminPlanFeature = {
  key: string
  name: string
  enabled: boolean
  description?: string
  category?: 'messaging' | 'automation' | 'ai' | 'team' | 'integrations'
}

export type SuperAdminPlanLimits = {
  users: number | null
  messagesPerMonth: number | null
  workspaces: number | null
}

export type SuperAdminPlan = {
  id: string
  code: string
  name: string
  description: string
  price: number | null
  currency: string
  billingPeriod: SuperAdminPlanBillingPeriod
  billingInterval?: string
  billingIntervalCount?: number
  status: SuperAdminPlanStatus
  popular: boolean
  trialDays: number | null
  limits: SuperAdminPlanLimits
  features: SuperAdminPlanFeature[]
  gateway?: string | null
  gatewayPlanId?: string | null
  isActive?: boolean
  sortOrder?: number
  createdAt: string
  updatedAt: string | null
}

export type SuperAdminPlanSummary = {
  total: number
  active: number
  draft: number
  archived: number
  popularName: string | null
}

export type CreateSuperAdminPlanBody = {
  name: string
  description?: string
  code?: string
  price: number | null
  currency: string
  billingPeriod: SuperAdminPlanBillingPeriod
  status: Exclude<SuperAdminPlanStatus, 'archived'>
  popular?: boolean
  trialDays?: number | null
  limits: {
    users?: number | null
    messagesPerMonth?: number | null
    workspaces?: number | null
  }
  features?: SuperAdminPlanFeature[]
  sortOrder?: number
}

export type UpdateSuperAdminPlanBody = Partial<CreateSuperAdminPlanBody>

export type ListSuperAdminPlansParams = {
  search?: string
  status?: SuperAdminPlanStatus | 'all'
}

/** GET /api/v1/billing/subscription — fields returned by BillingController.showSubscription */
export type BillingSubscription = {
  id: string
  organizationId: string
  planId: string
  status: string
  gateway?: string | null
  gatewaySubscriptionId?: string | null
  checkoutUrl?: string | null
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
  cancelAtPeriodEnd?: boolean | null
  lastPaymentStatus?: string | null
  lastPaymentAt?: string | null
}

/** POST /api/v1/billing/checkout — fields returned by BillingController.checkout */
export type BillingCheckoutResult = {
  subscriptionId: string
  planId: string
  status: string
  checkoutUrl?: string | null
  gatewaySubscriptionId?: string | null
  gatewayCustomerId?: string | null
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
}

export type BillingCheckoutBody = {
  planId: string
}

/** GET /api/v1/billing/plans — tenant-safe active catalog (no gateway secrets). */
export type TenantBillingPlanBillingPeriod = 'monthly' | 'yearly' | 'custom'

export type TenantBillingPlanFeature = {
  key: string
  name: string
  enabled: boolean
  category?: string
}

export type TenantBillingPlanLimits = {
  users: number | null
  messagesPerMonth: number | null
  workspaces: number | null
}

export type TenantBillingPlan = {
  id: string
  code: string
  name: string
  description: string
  price: number | null
  currency: string
  billingPeriod: TenantBillingPlanBillingPeriod
  popular: boolean
  trialDays: number | null
  limits: TenantBillingPlanLimits
  features: TenantBillingPlanFeature[]
  checkoutable: boolean
  sortOrder: number
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
          callbackURL:
            callbackURL ??
            `${typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/onboarding/organization`,
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

    delete: (contactId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/contacts/${contactId}`,
        { method: 'DELETE' }
      ),
  },

  tags: {
    list: () =>
      protectedRequest<{ data?: TagRecord[] } | TagRecord[]>('/api/v1/tags', {
        method: 'GET',
      }),

    get: (tagId: string) =>
      protectedRequest<{ data?: TagRecord } & TagRecord>(`/api/v1/tags/${tagId}`, {
        method: 'GET',
      }),

    create: (body: CreateTagBody) =>
      protectedRequest<{ data?: TagRecord } & TagRecord>('/api/v1/tags', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    update: (tagId: string, body: UpdateTagBody) =>
      protectedRequest<{ data?: TagRecord } & TagRecord>(`/api/v1/tags/${tagId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    delete: (tagId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(`/api/v1/tags/${tagId}`, {
        method: 'DELETE',
      }),

    contacts: {
      list: (tagId: string) =>
        protectedRequest<{ data?: ContactSummary[] } | ContactSummary[]>(
          `/api/v1/tags/${tagId}/contacts`,
          { method: 'GET' }
        ),

      add: (tagId: string, body: AssignTagContactBody) =>
        protectedRequest<{ data?: TagAssignmentRecord } & TagAssignmentRecord>(
          `/api/v1/tags/${tagId}/contacts`,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        ),

      remove: (tagId: string, contactId: string) =>
        protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
          `/api/v1/tags/${tagId}/contacts/${contactId}`,
          { method: 'DELETE' }
        ),
    },
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

    takeoverAi: (conversationId: string) =>
      protectedRequest<{ data?: InboxAiModePatch } & InboxAiModePatch>(
        `/api/v1/inbox/conversations/${conversationId}/ai/takeover`,
        { method: 'POST' }
      ),

    resumeAi: (conversationId: string) =>
      protectedRequest<{ data?: InboxAiModePatch } & InboxAiModePatch>(
        `/api/v1/inbox/conversations/${conversationId}/ai/resume`,
        { method: 'POST' }
      ),
  },

  notifications: {
    list: (params: ListNotificationsParams = {}) => {
      const qs = new URLSearchParams()
      if (params.page != null) qs.set('page', String(params.page))
      if (params.limit != null) qs.set('limit', String(params.limit))
      const query = qs.toString()
      return protectedRequest<
        | Paginated<Notification>
        | { data?: Notification[]; meta?: PaginationMeta }
        | { data?: { data?: Notification[]; meta?: PaginationMeta } }
      >(`/api/v1/notifications${query ? `?${query}` : ''}`, {
        method: 'GET',
      })
    },

    markAsRead: (notificationId: string) =>
      protectedRequest<{ data?: Notification } & Notification>(
        `/api/v1/notifications/${notificationId}/read`,
        { method: 'PATCH' }
      ),

    markAllAsRead: () =>
      protectedRequest<
        { data?: MarkAllNotificationsReadResult } & MarkAllNotificationsReadResult
      >('/api/v1/notifications/read-all', { method: 'PATCH' }),
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

    listTemplates: (params: ListWhatsappTemplatesParams = {}) => {
      const qs = new URLSearchParams()
      if (params.page != null) qs.set('page', String(params.page))
      if (params.perPage != null) qs.set('perPage', String(params.perPage))
      if (params.status) qs.set('status', params.status)
      if (params.category) qs.set('category', params.category)
      if (params.search?.trim()) qs.set('search', params.search.trim())
      const query = qs.toString()
      return protectedRequest<
        | Paginated<WhatsappMessageTemplate>
        | { data?: WhatsappMessageTemplate[]; meta?: PaginationMeta }
        | { data?: { data?: WhatsappMessageTemplate[]; meta?: PaginationMeta } }
      >(`/api/v1/whatsapp/templates${query ? `?${query}` : ''}`, {
        method: 'GET',
      })
    },

    getTemplate: (templateId: string) =>
      protectedRequest<{ data?: WhatsappMessageTemplate } & WhatsappMessageTemplate>(
        `/api/v1/whatsapp/templates/${templateId}`,
        { method: 'GET' }
      ),

    createTemplate: (body: CreateWhatsappTemplateBody) =>
      protectedRequest<{ data?: WhatsappMessageTemplate } & WhatsappMessageTemplate>(
        '/api/v1/whatsapp/templates',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    syncTemplates: () =>
      protectedRequest<{ data?: SyncWhatsappTemplatesResult } & SyncWhatsappTemplatesResult>(
        '/api/v1/whatsapp/templates/sync',
        { method: 'POST' }
      ),

    deleteTemplate: (templateId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/whatsapp/templates/${templateId}`,
        { method: 'DELETE' }
      ),
  },

  integrations: {
    list: () =>
      protectedRequest<{ data?: IntegrationConnection[] } | IntegrationConnection[]>(
        '/api/v1/integrations',
        { method: 'GET' }
      ),

    upsert: (provider: string, body: UpsertIntegrationConnectionBody) =>
      protectedRequest<{ data?: IntegrationConnection } & IntegrationConnection>(
        `/api/v1/integrations/${provider}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        }
      ),

    destroy: (provider: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/integrations/${provider}`,
        { method: 'DELETE' }
      ),
  },

  apiKeys: {
    list: () =>
      protectedRequest<{ data?: IntegrationApiKey[] } | IntegrationApiKey[]>(
        '/api/v1/api-keys',
        { method: 'GET' }
      ),

    create: (body: CreateIntegrationApiKeyBody) =>
      protectedRequest<{ data?: IntegrationApiKey } & IntegrationApiKey>('/api/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    revoke: (id: string) =>
      protectedRequest<{ data?: IntegrationApiKey } & IntegrationApiKey>(
        `/api/v1/api-keys/${id}/revoke`,
        { method: 'POST' }
      ),
  },

  knowledgeDocuments: {
    list: (params: ListKnowledgeDocumentsParams = {}) => {
      const qs = new URLSearchParams()
      if (params.page != null) qs.set('page', String(params.page))
      if (params.perPage != null) qs.set('perPage', String(params.perPage))
      if (params.status) qs.set('status', params.status)
      if (params.lifecycle) qs.set('lifecycle', params.lifecycle)
      const query = qs.toString()
      return protectedRequest<
        | Paginated<KnowledgeDocument>
        | { data?: KnowledgeDocument[]; meta?: PaginationMeta }
        | { data?: { data?: KnowledgeDocument[]; meta?: PaginationMeta } }
      >(`/api/v1/ai/knowledge-documents${query ? `?${query}` : ''}`, { method: 'GET' })
    },

    get: (documentId: string) =>
      protectedRequest<{ data?: KnowledgeDocument } & KnowledgeDocument>(
        `/api/v1/ai/knowledge-documents/${documentId}`,
        { method: 'GET' }
      ),

    create: (body: CreateKnowledgeDocumentBody) =>
      protectedRequest<{ data?: CreateKnowledgeDocumentResult } & CreateKnowledgeDocumentResult>(
        '/api/v1/ai/knowledge-documents',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    completeUpload: (documentId: string) =>
      protectedRequest<{ data?: KnowledgeDocument } & KnowledgeDocument>(
        `/api/v1/ai/knowledge-documents/${documentId}/complete-upload`,
        { method: 'POST' }
      ),

    delete: (documentId: string) =>
      protectedRequest<{ data?: KnowledgeDocument } & KnowledgeDocument>(
        `/api/v1/ai/knowledge-documents/${documentId}`,
        { method: 'DELETE' }
      ),

    restore: (documentId: string) =>
      protectedRequest<{ data?: KnowledgeDocument } & KnowledgeDocument>(
        `/api/v1/ai/knowledge-documents/${documentId}/restore`,
        { method: 'POST' }
      ),

    purge: (documentId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/ai/knowledge-documents/${documentId}/purge`,
        { method: 'POST' }
      ),
  },

  media: {
    list: (params: ListMediaParams = {}) => {
      const qs = new URLSearchParams()
      if (params.page != null) qs.set('page', String(params.page))
      if (params.perPage != null) qs.set('perPage', String(params.perPage))
      if (params.kind) qs.set('kind', params.kind)
      if (params.state) qs.set('state', params.state)
      if (params.search?.trim()) qs.set('search', params.search.trim())
      const query = qs.toString()
      return protectedRequest<
        | Paginated<MediaAsset>
        | { data?: MediaAsset[]; meta?: PaginationMeta }
        | { data?: { data?: MediaAsset[]; meta?: PaginationMeta } }
      >(`/api/v1/media${query ? `?${query}` : ''}`, { method: 'GET' })
    },

    quota: () =>
      protectedRequest<{ data?: MediaQuota } & MediaQuota>('/api/v1/media/quota', {
        method: 'GET',
      }),

    get: (mediaAssetId: string) =>
      protectedRequest<{ data?: MediaAsset } & MediaAsset>(`/api/v1/media/${mediaAssetId}`, {
        method: 'GET',
      }),

    initiateUpload: (body: InitiateMediaUploadBody) =>
      protectedRequest<{ data?: InitiateMediaUploadResult } & InitiateMediaUploadResult>(
        '/api/v1/media/uploads',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    completeUpload: (mediaAssetId: string) =>
      protectedRequest<{ data?: MediaAsset } & MediaAsset>(
        `/api/v1/media/uploads/${mediaAssetId}/complete`,
        { method: 'POST' }
      ),

    softDelete: (mediaAssetId: string) =>
      protectedRequest<{ data?: MediaAsset } & MediaAsset>(`/api/v1/media/${mediaAssetId}`, {
        method: 'DELETE',
      }),

    restore: (mediaAssetId: string) =>
      protectedRequest<{ data?: MediaAsset } & MediaAsset>(
        `/api/v1/media/${mediaAssetId}/restore`,
        { method: 'POST' }
      ),

    purge: (mediaAssetId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/media/${mediaAssetId}/purge`,
        { method: 'POST' }
      ),
  },

  billing: {
    getSubscription: () =>
      protectedRequest<{ data?: BillingSubscription } & BillingSubscription>(
        '/api/v1/billing/subscription',
        { method: 'GET' }
      ),

    listPlans: () =>
      protectedRequest<{ data?: { items: TenantBillingPlan[] } }>(
        '/api/v1/billing/plans',
        { method: 'GET' }
      ),

    checkout: (body: BillingCheckoutBody) =>
      protectedRequest<{ data?: BillingCheckoutResult } & BillingCheckoutResult>(
        '/api/v1/billing/checkout',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
  },

  campaigns: {
    list: (params: ListCampaignsParams = {}) => {
      const qs = new URLSearchParams()
      if (params.page != null) qs.set('page', String(params.page))
      if (params.limit != null) qs.set('limit', String(params.limit))
      if (params.perPage != null) qs.set('perPage', String(params.perPage))
      if (params.search?.trim()) qs.set('search', params.search.trim())
      if (params.status) qs.set('status', params.status)
      if (params.sortBy) qs.set('sortBy', params.sortBy)
      if (params.sortOrder) qs.set('sortOrder', params.sortOrder)
      const query = qs.toString()
      return protectedRequest<
        | Paginated<Campaign>
        | { data?: Campaign[]; meta?: PaginationMeta }
        | { data?: { data?: Campaign[]; meta?: PaginationMeta } }
      >(`/api/v1/campaigns${query ? `?${query}` : ''}`, {
        method: 'GET',
      })
    },

    get: (campaignId: string) =>
      protectedRequest<{ data?: Campaign } & Campaign>(`/api/v1/campaigns/${campaignId}`, {
        method: 'GET',
      }),

    create: (body: CreateCampaignBody) =>
      protectedRequest<{ data?: Campaign } & Campaign>('/api/v1/campaigns', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    update: (campaignId: string, body: UpdateCampaignBody) =>
      protectedRequest<{ data?: Campaign } & Campaign>(`/api/v1/campaigns/${campaignId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    delete: (campaignId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/campaigns/${campaignId}`,
        { method: 'DELETE' }
      ),

    replaceRecipients: (campaignId: string, body: ReplaceCampaignRecipientsBody) =>
      protectedRequest<{ data?: Campaign } & Campaign>(`/api/v1/campaigns/${campaignId}/recipients`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    schedule: (campaignId: string, body: { scheduledAt: string; timeZone?: string }) =>
      protectedRequest<{ data?: Campaign } & Campaign>(`/api/v1/campaigns/${campaignId}/schedule`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    send: (campaignId: string) =>
      protectedRequest<{ data?: Campaign } & Campaign>(`/api/v1/campaigns/${campaignId}/send`, {
        method: 'POST',
      }),

    cancel: (campaignId: string) =>
      protectedRequest<{ data?: Campaign } & Campaign>(`/api/v1/campaigns/${campaignId}/cancel`, {
        method: 'PATCH',
      }),

    preview: (campaignId: string, body: { variables?: Record<string, string> } = {}) =>
      protectedRequest<{ data?: CampaignPreview } & CampaignPreview>(
        `/api/v1/campaigns/${campaignId}/preview`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),

    duplicate: (campaignId: string) =>
      protectedRequest<{ data?: Campaign } & Campaign>(
        `/api/v1/campaigns/${campaignId}/duplicate`,
        { method: 'POST' }
      ),

    changeStatus: (campaignId: string, body: { status: CampaignStatus }) =>
      protectedRequest<{ data?: Campaign } & Campaign>(
        `/api/v1/campaigns/${campaignId}/status`,
        {
          method: 'PATCH',
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

  ownership: {
    /**
     * Transfer org ownership — current owner only.
     * Body: targetMemberId, replacementRoleForCurrentOwner, reason (min 5).
     */
    transfer: (body: TransferOwnershipBody) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        '/api/v1/ownership/transfer',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
  },

  audit: {
    /**
     * Tenant authorization audit events (newest first).
     * Active-organization scoped. Requires audit:view.
     */
    list: (params: ListAuditParams = {}) => {
      const qs = new URLSearchParams()
      if (params.limit != null) qs.set('limit', String(params.limit))
      const query = qs.toString()
      return protectedRequest<
        { data?: AuthorizationAuditEvent[] } | AuthorizationAuditEvent[]
      >(`/api/v1/audit${query ? `?${query}` : ''}`, {
        method: 'GET',
      })
    },
  },

  organizationAdmin: {
    /**
     * Paginated org users — Owner/Admin only (`accessOrgAdmin`).
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

    /** GET /api/v1/organization-admin/users/:userId — Owner/Admin only. */
    getUser: (userId: string) =>
      protectedRequest<{ data?: OrganizationAdminUser } & OrganizationAdminUser>(
        `/api/v1/organization-admin/users/${userId}`,
        { method: 'GET' }
      ),

    /** PATCH /api/v1/organization-admin/users/:userId — profile + isActive. */
    updateUser: (userId: string, body: UpdateOrganizationAdminUserBody) =>
      protectedRequest<{ data?: OrganizationAdminUser } & OrganizationAdminUser>(
        `/api/v1/organization-admin/users/${userId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        }
      ),

    /**
     * DELETE /api/v1/organization-admin/users/:userId —
     * soft-deletes the org membership (does not delete the user account).
     */
    softDeleteUser: (userId: string) =>
      protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
        `/api/v1/organization-admin/users/${userId}`,
        { method: 'DELETE' }
      ),
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

    plans: {
      list: (params: ListSuperAdminPlansParams = {}) => {
        const qs = new URLSearchParams()
        if (params.search?.trim()) qs.set('search', params.search.trim())
        if (params.status && params.status !== 'all') qs.set('status', params.status)
        const query = qs.toString()
        return protectedRequest<{
          data?: { items: SuperAdminPlan[]; summary: SuperAdminPlanSummary }
        }>(`/api/v1/super-admin/plans${query ? `?${query}` : ''}`, {
          method: 'GET',
        })
      },

      get: (planId: string) =>
        protectedRequest<{ data?: SuperAdminPlan } & SuperAdminPlan>(
          `/api/v1/super-admin/plans/${planId}`,
          { method: 'GET' }
        ),

      create: (body: CreateSuperAdminPlanBody) =>
        protectedRequest<{ data?: SuperAdminPlan } & SuperAdminPlan>(
          '/api/v1/super-admin/plans',
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        ),

      update: (planId: string, body: UpdateSuperAdminPlanBody) =>
        protectedRequest<{ data?: SuperAdminPlan } & SuperAdminPlan>(
          `/api/v1/super-admin/plans/${planId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          }
        ),

      destroy: (planId: string) =>
        protectedRequest<{ data?: SuperAdminPlan } & SuperAdminPlan>(
          `/api/v1/super-admin/plans/${planId}`,
          { method: 'DELETE' }
        ),
    },

    invoices: {
      list: (params: ListSuperAdminInvoicesParams = {}) => {
        const qs = new URLSearchParams()
        if (params.page != null) qs.set('page', String(params.page))
        if (params.perPage != null) qs.set('perPage', String(params.perPage))
        if (params.search?.trim()) qs.set('search', params.search.trim())
        if (params.status && params.status !== 'all') qs.set('status', params.status)
        if (params.issueMonth && params.issueMonth !== 'all') qs.set('issueMonth', params.issueMonth)
        if (params.billingPeriod && params.billingPeriod !== 'all') {
          qs.set('billingPeriod', params.billingPeriod)
        }
        const query = qs.toString()
        return protectedRequest<
          | Paginated<SuperAdminInvoice>
          | { data?: SuperAdminInvoice[]; meta?: PaginationMeta }
        >(`/api/v1/super-admin/invoices${query ? `?${query}` : ''}`, {
          method: 'GET',
        })
      },

      summary: (params: Omit<ListSuperAdminInvoicesParams, 'page' | 'perPage'> = {}) => {
        const qs = new URLSearchParams()
        if (params.search?.trim()) qs.set('search', params.search.trim())
        if (params.status && params.status !== 'all') qs.set('status', params.status)
        if (params.issueMonth && params.issueMonth !== 'all') qs.set('issueMonth', params.issueMonth)
        if (params.billingPeriod && params.billingPeriod !== 'all') {
          qs.set('billingPeriod', params.billingPeriod)
        }
        const query = qs.toString()
        return protectedRequest<
          { data?: SuperAdminInvoiceSummary } & SuperAdminInvoiceSummary
        >(`/api/v1/super-admin/invoices/summary${query ? `?${query}` : ''}`, {
          method: 'GET',
        })
      },

      get: (invoiceId: string) =>
        protectedRequest<{ data?: SuperAdminInvoice } & SuperAdminInvoice>(
          `/api/v1/super-admin/invoices/${invoiceId}`,
          { method: 'GET' }
        ),

      create: (body: CreateSuperAdminInvoiceBody) =>
        protectedRequest<{ data?: SuperAdminInvoice } & SuperAdminInvoice>(
          '/api/v1/super-admin/invoices',
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        ),

      markPaid: (invoiceId: string, body: MarkSuperAdminInvoicePaidBody = {}) =>
        protectedRequest<{ data?: SuperAdminInvoice } & SuperAdminInvoice>(
          `/api/v1/super-admin/invoices/${invoiceId}/mark-paid`,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        ),

      regenerate: (invoiceId: string) =>
        protectedRequest<{ data?: SuperAdminInvoice } & SuperAdminInvoice>(
          `/api/v1/super-admin/invoices/${invoiceId}/regenerate`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          }
        ),

      send: (invoiceId: string) =>
        protectedRequest<{ data?: { ok: boolean } } & { ok: boolean }>(
          `/api/v1/super-admin/invoices/${invoiceId}/send`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          }
        ),

      download: (invoiceId: string) =>
        protectedBlobRequest(`/api/v1/super-admin/invoices/${invoiceId}/download`, {
          method: 'GET',
        }),
    },

    aiConfig: {
      get: () =>
        protectedRequest<{ data?: PlatformAiConfig } & PlatformAiConfig>(
          '/api/v1/super-admin/ai-config',
          { method: 'GET' }
        ),

      update: (body: UpdatePlatformAiConfigBody) =>
        protectedRequest<{ data?: PlatformAiConfig } & PlatformAiConfig>(
          '/api/v1/super-admin/ai-config',
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          }
        ),
    },

    auditLogs: {
      list: (params: ListAuditParams = {}) => {
        const qs = new URLSearchParams()
        if (params.limit != null) qs.set('limit', String(params.limit))
        if (params.organizationId) qs.set('organizationId', params.organizationId)
        const query = qs.toString()
        return protectedRequest<
          { data?: AuthorizationAuditEvent[] } | AuthorizationAuditEvent[]
        >(`/api/v1/super-admin/audit-logs${query ? `?${query}` : ''}`, {
          method: 'GET',
        })
      },
    },

    platformUsers: {
      list: (params: ListSuperAdminPlatformUsersParams = {}) => {
        const qs = new URLSearchParams()
        if (params.page != null) qs.set('page', String(params.page))
        if (params.perPage != null) qs.set('perPage', String(params.perPage))
        if (params.search?.trim()) qs.set('search', params.search.trim())
        if (params.status && params.status !== 'all') qs.set('status', params.status)
        if (params.organizationId) qs.set('organizationId', params.organizationId)
        if (params.role?.trim()) qs.set('role', params.role.trim())
        const query = qs.toString()
        return protectedRequest<
          | Paginated<SuperAdminPlatformUser>
          | { data?: SuperAdminPlatformUser[]; meta?: PaginationMeta }
        >(`/api/v1/super-admin/platform-users${query ? `?${query}` : ''}`, {
          method: 'GET',
        })
      },
    },
  },
}
