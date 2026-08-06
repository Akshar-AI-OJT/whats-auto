import vine from '@vinejs/vine'

/** Soft-deleted campaigns use status = deleted (`broadcasts` has no deletedAt column). */
export const CAMPAIGN_SOFT_DELETED_STATUS = 'deleted' as const

/** Statuses allowed when creating a campaign (matches broadcasts.status comment). */
export const CAMPAIGN_CREATE_STATUSES = ['draft', 'scheduled'] as const

/** Active lifecycle statuses returned by list/get (excludes soft-deleted). */
export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'failed',
] as const

/** Whitelisted sort columns on `broadcasts` (camelCase DB columns). */
export const CAMPAIGN_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'status',
  'scheduledAt',
  'totalRecipients',
  'sentCount',
  'deliveredCount',
] as const

export const createCampaignValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200),
    whatsappConfigId: vine.string().trim().uuid().optional(),
    messageTemplateId: vine.string().trim().uuid().optional(),
    scheduledAt: vine.date().optional(),
    status: vine.enum(CAMPAIGN_CREATE_STATUSES).optional(),
  })
)

export const listCampaignsValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    /** Page size — preferred query name for this endpoint. */
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
    /** Alias for `limit` (matches other modules that use `perPage`). */
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    search: vine.string().trim().minLength(1).maxLength(200).optional(),
    status: vine.enum(CAMPAIGN_STATUSES).optional(),
    sortBy: vine.enum(CAMPAIGN_SORT_FIELDS).optional(),
    sortOrder: vine.enum(['asc', 'desc'] as const).optional(),
  })
)

export const campaignIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

/** Editable campaign fields only — counters, org, creator, and timestamps are immutable. */
export const updateCampaignValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200).optional(),
    whatsappConfigId: vine.string().trim().uuid().nullable().optional(),
    messageTemplateId: vine.string().trim().uuid().nullable().optional(),
    scheduledAt: vine.date().nullable().optional(),
    status: vine.enum(CAMPAIGN_CREATE_STATUSES).optional(),
  })
)
