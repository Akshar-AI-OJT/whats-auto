import { createApi } from '@/lib/api-calls'

export type { ApiError } from '@/lib/tuyau'

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

/** Structured org address stored as jsonb — country lives on organizations.country. */
export type OrganizationAddress = {
  addressLine1: string
  addressLine2?: string | null
  city: string
  state: string
  postalCode: string
}

export type CreateOrganizationBody = {
  name: string
  slug: string
  email: string
  phone: string
  website?: string
  industry?: string
  organizationType: OrganizationType
  /** Legacy free-text or structured address object. */
  address: string | OrganizationAddress
  pan: string
  gstin?: string
  country: string
  timezone: string
  currency?: string
  description?: string
  businessSize?: string
  alternatePhone?: string
  defaultLanguage?: string
  businessRegistrationNumber?: string
  designation?: string
}

export type CreatedOrganization = {
  id: string
  name: string
  slug: string
  role: string
  status?: 'pending_setup' | 'verified_setup' | 'active' | 'suspended' | 'false'
  sessionActivated?: boolean
  reused?: boolean
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
  address?: OrganizationAddress | string | null
  pan?: string | null
  gstin?: string | null
  country: string
  timezone: string
  currency?: string | null
  description?: string | null
  businessSize?: string | null
  alternatePhone?: string | null
  defaultLanguage?: string | null
  businessRegistrationNumber?: string | null
  role: string
  createdAt: string
  status?: 'pending_setup' | 'verified_setup' | 'active' | 'suspended' | 'false'
}

export type UpdateOrganizationBody = {
  name?: string
  phone?: string | null
  website?: string | null
  industry?: string | null
  organizationType?: OrganizationType | null
  address?: string | OrganizationAddress
  pan?: string | null
  gstin?: string | null
  country?: string
  timezone?: string
  currency?: string | null
  description?: string | null
  businessSize?: string | null
  alternatePhone?: string | null
  defaultLanguage?: string | null
  businessRegistrationNumber?: string | null
  designation?: string | null
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
  address: OrganizationAddress | string | null
  pan: string | null
  gstin: string | null
  country: string
  timezone: string
  currency: string | null
  description?: string | null
  businessSize?: string | null
  alternatePhone?: string | null
  defaultLanguage?: string | null
  businessRegistrationNumber?: string | null
}

export type OrganizationSmtpTransport = 'smtp' | 'api'

export type OrganizationSmtpProviderPreset =
  'gmail' | 'sendgrid' | 'resend' | 'ses' | 'brevo' | 'custom'

export type OrganizationSmtpConfig = {
  id: string
  organizationId: string
  transport: OrganizationSmtpTransport
  providerPreset: OrganizationSmtpProviderPreset
  senderName: string
  senderEmail: string
  host: string | null
  port: number | null
  secure: boolean | null
  username: string | null
  status: string
  lastTestedAt: string | null
  lastErrorMessage: string | null
  hasPassword: boolean
  hasApiKey: boolean
  createdAt: string
  updatedAt: string | null
}

export type UpsertOrganizationSmtpBody = {
  transport: OrganizationSmtpTransport
  providerPreset: OrganizationSmtpProviderPreset
  senderName: string
  senderEmail: string
  host?: string | null
  port?: number | null
  secure?: boolean | null
  username?: string | null
  password?: string | null
  apiKey?: string | null
}

export type TestOrganizationSmtpBody = {
  draftConfig?: Partial<UpsertOrganizationSmtpBody>
}

export type AccessContext = {
  organizationId: string
  organizationName: string
  status?: 'pending_setup' | 'verified_setup' | 'active' | 'suspended' | 'false'
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

export type ListContactsParams = {
  page?: number
  perPage?: number
  search?: string
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

export type UpdateContactBody = {
  phoneNumber?: string
  countryCode?: string
  name?: string | null
  email?: string | null
  company?: string | null
}

export type ContactCsvColumnMapping = {
  phone?: string
  name?: string
  email?: string
  company?: string
}

export type ContactImportRowResult = {
  rowNumber: number
  status: 'processed' | 'failed' | 'skipped'
  action: 'inserted' | 'skipped' | null
  errorMessage: string | null
  contactId: string | null
  rawData: Record<string, string>
}

export type ContactImportResult = {
  id: string
  organizationId: string
  fileName: string
  status: string
  defaultCountryCode: string | null
  columnMapping: ContactCsvColumnMapping
  totalRows: number
  processedRows: number
  successCount: number
  errorCount: number
  completedAt: string | null
  rows: ContactImportRowResult[]
}

export type ImportContactsBody = {
  file: File
  columnMapping: ContactCsvColumnMapping
  defaultCountryCode?: string
}

/**
 * UI model for Customer Groups. Backed by `/api/v1/tags` — see `api.tags`
 * and `customer-group-service.ts`. `type` is always static in this UI.
 * Campaign usage is not mapped into the Customer Group list.
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
  description?: string | null
  status?: CustomerGroupStatus
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
  description?: string | null
}

export type UpdateTagBody = {
  name?: string
  color?: string | null
  description?: string | null
  status?: CustomerGroupStatus
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
  automationBlocked?: boolean
  openFlowSessionStatus?: string | null
  contact: InboxConversationContact
}

export type InboxAiMode = 'AI_AUTO' | 'HANDOVER' | 'HUMAN_ACTIVE'

export type InboxAiHandoverReason = 'low_confidence' | 'keyword_match' | 'business_exception'

export type InboxAiModePatch = {
  id: string
  aiMode: InboxAiMode | string
  aiHandoverReason: string | null
  automationBlocked?: boolean
  openFlowSessionStatus?: string | null
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
  /** Routes upload into organizations/{orgId}/profile/logo.{ext}. */
  purpose?: 'organization_logo'
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
  businessId?: string | null
  metaVerificationStatus?: string | null
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

export type WhatsappTemplateHeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT'

export type WhatsappTemplateStatus =
  'draft' | 'pending' | 'approved' | 'rejected' | 'deleted' | 'paused' | 'disabled' | string

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
  language?: string
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
  'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled' | string

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
  startDate?: string
  endDate?: string
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

export type CreateInvitationBody = {
  email: string
  firstname: string
  lastname?: string
  role: string
  designation?: string
}

export type CreatedInvitation = {
  userId: string
  invitationId: string
  email: string
  role: string
  isNewUser: boolean
  hasExistingPassword: boolean
  emailSent: boolean
  needsSetup: boolean
}

export type OrganizationMember = {
  id: string
  userId: string
  role: string
  email: string
  name: string
  emailVerified?: boolean
  designation?: string | null
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
  emailVerified?: boolean
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
  search?: string
  role?: string
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
  search?: string
  eventType?: string
  actorUserId?: string
  targetType?: string
  dateFrom?: string
  dateTo?: string
  /** Audit log pages only — not used by overview/analytics recent lists. */
  includeFacets?: boolean
}

export type AuditActorFacet = {
  id: string
  name: string | null
  email: string | null
}

export type AuditListPayload = {
  data: AuthorizationAuditEvent[]
  eventTypes?: string[]
  actors?: AuditActorFacet[]
  targetTypes?: string[]
}

export type AnalyticsBreakdownItem = {
  key: string
  label: string
  value: number
}

export type TenantAnalyticsSummary = {
  totalContacts: number
  contactGrowth: Array<{ key: string; value: number }>
  totalCampaigns: number
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  readCount: number
  repliedCount: number
  failedCount: number
  deliveryRate: number
  campaignStatusBreakdown: AnalyticsBreakdownItem[]
  totalConversations: number
  unreadMessages: number
  conversationStatusBreakdown: AnalyticsBreakdownItem[]
  connectedWhatsappNumbers: number
  whatsappStatusBreakdown: AnalyticsBreakdownItem[]
  totalTemplates: number
  templateStatusBreakdown: AnalyticsBreakdownItem[]
  templateCategoryBreakdown: AnalyticsBreakdownItem[]
  templateUsage: AnalyticsBreakdownItem[]
  totalGroups: number
  topGroups: Array<{ id: string; name: string; contactCount: number }>
}

export type PlatformAnalyticsSummary = {
  totalOrganizations: number
  activeOrganizations: number
  inactiveOrganizations: number
  trialOrganizations: number
  organizationGrowth: Array<{ key: string; created: number; cumulative: number }>
  activeInactive: AnalyticsBreakdownItem[]
  planDistribution: AnalyticsBreakdownItem[]
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
  'create_organization' | 'select_organization' | 'complete_payment' | 'ready'

export type OnboardingState = {
  activeOrganizationId: string | null
  organizations: Array<{ id: string; name: string; role?: string }>
  nextStep: OnboardingNextStep
  /** Global superadmin — no tenant org required ([D72]). */
  isPlatformAdmin?: boolean
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

/** Organization usability / provisioning status returned by the API. */
export type OrganizationStatusValue =
  'pending_setup' | 'verified_setup' | 'active' | 'suspended' | 'false'

/** Nested org membership from GET /api/v1/super-admin/platform-users */
export type SuperAdminPlatformUserOrganization = {
  memberId: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  /** Exact backend status string — never coerced with Boolean(). */
  organizationStatus: OrganizationStatusValue | string
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
  /** pending_setup | verified_setup | active | suspended | false (soft-deleted) */
  status: 'pending_setup' | 'verified_setup' | 'active' | 'suspended' | 'false' | string
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

export type SuperAdminSubscriptionBillingFilter = 'monthly' | 'custom' | 'all'

export type ListSuperAdminSubscriptionsParams = {
  page?: number
  perPage?: number
  search?: string
  status?: SuperAdminSubscriptionStatus | 'all'
  plan?: string
  billing?: SuperAdminSubscriptionBillingFilter
}

export type SuperAdminSubscriptionListSummary = {
  active: number
  trialing: number
  past_due: number
  cancelled: number
}

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

/** Row item from GET /api/v1/super-admin/platform-settings */
export type PlatformSettingState = 'enabled' | 'disabled' | 'scheduled'

export type PlatformSettingItem = {
  id: string
  key: string
  value: string
  state: PlatformSettingState
}

export type PlatformSettingsSnapshot = {
  branding: PlatformSettingItem[]
  authentication: PlatformSettingItem[]
  smtp: PlatformSettingItem[]
  oauth: PlatformSettingItem[]
  maintenanceMode: PlatformSettingItem[]
  configuration: PlatformSettingItem[]
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
  workingSetSize?: number
  summaryTurnThreshold?: number
  embeddingProvider?: string
  embeddingModel?: string
  maxOutputTokens?: number
  confirmReindex?: boolean
}

export type PlatformMfaEnforcement =
  'none' | 'super_admin' | 'super_admin_and_platform_admin' | 'all'

/** Row from GET /api/v1/super-admin/platform-settings (no SMTP/OAuth secrets). */
export type PlatformSettings = {
  id: string
  platformName: string
  primaryDomain: string
  supportEmail: string
  sessionTimeoutHours: number
  mfaEnforcement: PlatformMfaEnforcement | string
  passwordMinLength: number
  smtpMailer: string
  smtpFromName: string
  smtpFromAddress: string
  smtpDailyLimit: number
  smtpHostConfigured: boolean
  smtpPasswordConfigured: boolean
  brevoApiKeyConfigured: boolean
  googleSignInEnabled: boolean
  googleSignInConfigured: boolean
  microsoftSignInEnabled: boolean
  microsoftSignInConfigured: boolean
  oauthRedirectUrl: string
  maintenanceEnabled: boolean
  allowlistedIps: string[]
  nextMaintenanceWindow: string | null
  defaultTimezone: string
  dataRetentionDays: number
  apiRateLimitPerMinute: number
  billingBrandName: string
  billingLegalName: string
  billingTagline: string
  billingAddress: string
  billingGstin: string
  billingEmail: string
  billingPhone: string
  billingWebsite: string
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string | null
}

export type UpdatePlatformSettingsBody = {
  platformName?: string
  primaryDomain?: string
  supportEmail?: string
  sessionTimeoutHours?: number
  mfaEnforcement?: PlatformMfaEnforcement
  passwordMinLength?: number
  smtpDailyLimit?: number
  googleSignInEnabled?: boolean
  microsoftSignInEnabled?: boolean
  oauthRedirectUrl?: string
  maintenanceEnabled?: boolean
  allowlistedIps?: string[]
  nextMaintenanceWindow?: string | null
  defaultTimezone?: string
  dataRetentionDays?: number
  apiRateLimitPerMinute?: number
  billingBrandName?: string
  billingLegalName?: string
  billingTagline?: string
  billingAddress?: string
  billingGstin?: string
  billingEmail?: string
  billingPhone?: string
  billingWebsite?: string
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

export type ConversationFlowStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type ConversationFlowTriggerType =
  'KEYWORD' | 'INBOUND_ANY' | 'CAMPAIGN_REPLY' | 'SUBFLOW_ENTRY'

export type ConversationFlowKeywordMatchType = 'exact' | 'contains' | 'regex'

export type ConversationFlowExpiryMode = 'RESUME_PROMPT' | 'RESTART' | 'RESUME_SILENT'

export type ConversationFlowTangentResume = 'IMMEDIATE_REPROMPT' | 'WAIT_FOR_NEXT'

export type ConversationFlowTriggerConfig = {
  keywords?: string[]
  matchType?: ConversationFlowKeywordMatchType
}

export type ConversationFlowSettings = {
  sessionTtlMinutes: number
  onExpiry: ConversationFlowExpiryMode
  tangentResume: ConversationFlowTangentResume
  handoverKeywords: string[]
}

export type ConversationFlowGraphNode = {
  id: string
  type: string
  position?: { x: number; y: number }
  data?: Record<string, unknown>
}

export type ConversationFlowGraphEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export type ConversationFlowViewport = {
  x: number
  y: number
  zoom: number
}

export type ConversationFlowValidationError = {
  code?: string
  message?: string
  nodeId?: string
}

export type ConversationFlow = {
  id: string
  organizationId: string
  name: string
  description: string | null
  status: ConversationFlowStatus | string
  isDefault: boolean
  triggerType: ConversationFlowTriggerType | string
  publishedVersionId: string | null
  createdAt: string
  updatedAt: string | null
  triggerConfig?: ConversationFlowTriggerConfig
  settings?: ConversationFlowSettings
  createdByUserId?: string | null
  version?: {
    id: string
    versionNumber: number
    nodes: ConversationFlowGraphNode[]
    edges: ConversationFlowGraphEdge[]
    viewport: ConversationFlowViewport
    validationStatus: string
    validationErrors: ConversationFlowValidationError[] | unknown
    createdAt: string
  }
}

export type ListConversationFlowsParams = {
  page?: number
  perPage?: number
  status?: ConversationFlowStatus
  search?: string
}

export type CreateConversationFlowBody = {
  name: string
  description?: string | null
  triggerType?: ConversationFlowTriggerType
  triggerConfig?: ConversationFlowTriggerConfig
  settings?: Partial<ConversationFlowSettings>
  isDefault?: boolean
}

export type UpdateConversationFlowBody = {
  name?: string
  description?: string | null
  triggerType?: ConversationFlowTriggerType
  triggerConfig?: ConversationFlowTriggerConfig
  settings?: Partial<ConversationFlowSettings>
  isDefault?: boolean
  nodes?: ConversationFlowGraphNode[]
  edges?: ConversationFlowGraphEdge[]
  viewport?: ConversationFlowViewport
}

export type ConversationFlowValidateResult = {
  valid: boolean
  errors: ConversationFlowValidationError[]
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

/** Display-ready seller “From” block from GET /api/v1/super-admin/invoices/billing-profile */
export type SuperAdminInvoiceBillingProfile = {
  brandName: string
  legalName: string
  tagline: string
  addressLines: string[]
  gstin: string
  email: string
  phone: string
  website: string
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
  currency?: string
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
  seats?: number | null
  whatsappNumbers?: number | null
  maxContacts?: number | null
  messagesPerMonth: number | null
  campaignsPerMonth?: number | null
  maxBroadcastRecipients?: number | null
  storageBytes?: number | null
  maxFileUploadMb?: number
  maxActiveFlows?: number | null
  maxKnowledgeDocs?: number | null
  maxKnowledgeDocSizeMb?: number | null
  aiRepliesPerMonth?: number | null
  maxStoreConnections?: number | null
  maxApiKeys?: number | null
  maxWebhookEndpoints?: number | null
  analyticsRetentionDays?: number | null
  auditLogRetentionDays?: number | null
  maxTemplates?: number | null
  conversationInboxRetentionDays?: number | null
  aiGenerationsPerConversationHour?: number
  dispatchRatePerSec?: number
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
  limits: SuperAdminPlanLimits
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
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
  cancelAtPeriodEnd?: boolean | null
  lastPaymentStatus?: string | null
  lastPaymentAt?: string | null
}

/** GET /api/v1/billing/entitlements — resolved plan limits, features, and meters */
export type BillingEntitlementsSnapshot = {
  limits: Record<string, number | null> | null
  features: Array<{ key: string; enabled: boolean }>
  usage: {
    messages: { used: number; limit: number | null }
    campaigns: { used: number; limit: number | null }
    aiCustomerLlmCalls: {
      used: number
      limit: number | null
      percentUsed: number | null
      nearLimit: boolean
      exceeded: boolean
    }
    storageBytes: { used: number; limit: number | null }
  }
}

/** POST /api/v1/billing/checkout — Orders API Checkout.js fields */
/** POST /api/v1/billing/checkout — free activation or Razorpay Checkout.js fields */
export type BillingCheckoutFreeResult = {
  mode: 'free'
  orderId: string
  subscriptionId: string
  alreadyApplied: boolean
  plan: {
    id: string
    code: string
    name: string
    price: number
  }
}

/** POST /api/v1/billing/checkout — Razorpay branch (legacy shape + mode) */
export type BillingCheckoutRazorpayResult = {
  mode: 'razorpay'
  orderId: string
  amount: number
  currency: string
  keyId: string
  purpose: 'new_subscription' | 'renewal' | 'plan_change'
  plan: {
    id: string
    code: string
    name: string
    price: number
  }
  prefill: {
    name: string
    email: string
    contact: string | null
  }
}

export type BillingCheckoutResponse = BillingCheckoutFreeResult | BillingCheckoutRazorpayResult

/** @deprecated Use BillingCheckoutRazorpayResult */
export type BillingCheckoutResult = Omit<BillingCheckoutRazorpayResult, 'mode'>

export type BillingCheckoutBody = {
  planId: string
}

export type BillingVerifyBody = {
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}

export type BillingVerifyResult = {
  orderId: string
  subscriptionId: string
  invoiceId: string
  alreadyApplied: boolean
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
  /** Razorpay checkout (price > 0). */
  checkoutable: boolean
  /** Local free activation (price === 0). */
  freeActivatable: boolean
  sortOrder: number
}

export const GLOBAL_SEARCH_RESULT_TYPES = [
  'contact',
  'conversation',
  'campaign',
  'template',
  'flow',
  'customer_group',
  'organization',
  'user',
  'plan',
  'subscription',
  'invoice',
] as const

export type GlobalSearchResultType = (typeof GLOBAL_SEARCH_RESULT_TYPES)[number]

export type GlobalSearchResult = {
  type: GlobalSearchResultType
  id: string
  title: string
  description: string | null
}

export type GlobalSearchResponse = {
  query: string
  results: GlobalSearchResult[]
}

/** GET /api/v1/demo/availability */
export type DemoAvailabilitySlot = {
  id: string
  startTime: string
  endTime: string
  label: string
  available: boolean
}

export type DemoAvailability = {
  date: string
  timeZone: string
  today: string
  durationMinutes: number
  slots: DemoAvailabilitySlot[]
}

/** POST /api/v1/demo/bookings */
export type CreateDemoBookingBody = {
  name: string
  email: string
  slotId: string
  timeZone: string
  company?: string
  phone?: string
  companySize?: string
  purpose?: string
}

export type DemoBooking = {
  id: string
  fullName: string
  email: string
  company: string | null
  phone: string | null
  companySize: string | null
  purpose: string | null
  startsAt: string
  endsAt: string
  timeZone: string
  demoTimeZone: string
  status: string
  meetingUrl: string | null
  calendarEventId: string | null
  createdAt: string
}

export const api = createApi()
