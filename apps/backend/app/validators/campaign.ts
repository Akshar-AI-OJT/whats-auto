import vine from '@vinejs/vine'

/** Soft-deleted campaigns use status = deleted (`broadcasts` has no deletedAt column). */
export const CAMPAIGN_SOFT_DELETED_STATUS = 'deleted' as const

/** Statuses allowed when creating a campaign (matches broadcasts.status comment). */
export const CAMPAIGN_CREATE_STATUSES = ['draft', 'scheduled'] as const

/**
 * Statuses eligible for POST /campaigns/:id/send.
 * `sending` is the in-progress / "running" status on `broadcasts`.
 */
export const CAMPAIGN_SENDABLE_STATUSES = ['draft', 'scheduled'] as const

/** In-progress status after a successful send kickoff (product "Running"). */
export const CAMPAIGN_SENDING_STATUS = 'sending' as const

/**
 * Statuses eligible for POST /campaigns/:id/schedule (includes reschedule).
 */
export const CAMPAIGN_SCHEDULABLE_STATUSES = ['draft', 'scheduled'] as const

/** Status after a successful schedule kickoff. */
export const CAMPAIGN_SCHEDULED_STATUS = 'scheduled' as const

/**
 * Status after canceling a scheduled campaign.
 * `broadcasts` has no "cancelled" status — cancel returns the campaign to draft.
 */
export const CAMPAIGN_DRAFT_STATUS = 'draft' as const

/** Active lifecycle statuses returned by list/get (excludes soft-deleted). */
export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'failed',
  'cancelled',
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

export const CAMPAIGN_VARIABLE_MAPPING_SOURCES = [
  'contact_field',
  'custom_field',
  'static',
] as const

export type CampaignVariableMappingSource = (typeof CAMPAIGN_VARIABLE_MAPPING_SOURCES)[number]

export type CampaignVariableMapping =
  | { source: 'contact_field'; field: string }
  | { source: 'custom_field'; field: string }
  | { source: 'static'; value: string }

export type CampaignVariableMappings = Record<string, CampaignVariableMapping>

const campaignVariableMappingSchema = vine.union([
  vine.union.if(
    (value) => vine.helpers.isObject(value) && value.source === 'contact_field',
    vine.object({
      source: vine.enum(['contact_field'] as const),
      field: vine.string().trim().minLength(1),
    })
  ),
  vine.union.if(
    (value) => vine.helpers.isObject(value) && value.source === 'custom_field',
    vine.object({
      source: vine.enum(['custom_field'] as const),
      field: vine.string().trim().minLength(1),
    })
  ),
  vine.union.if(
    (value) => vine.helpers.isObject(value) && value.source === 'static',
    vine.object({
      source: vine.enum(['static'] as const),
      value: vine.string(),
    })
  ),
  vine.union.else(
    vine.object({
      source: vine.enum(CAMPAIGN_VARIABLE_MAPPING_SOURCES),
    })
  ),
])

const campaignVariableMappingsSchema = vine.record(campaignVariableMappingSchema)

/**
 * Keep scheduledAt as a string so timezone intent is not lost.
 * vine.date() parses naive `YYYY-MM-DD HH:mm:ss` in the Node process timezone
 * (TZ=UTC), which would store 10:55 PM local as 10:55 PM UTC.
 * CampaignService converts naive values in the organization timezone once.
 */
const scheduledAtString = vine.string().trim().minLength(1)

export const createCampaignValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200),
    whatsappConfigId: vine.string().trim().uuid().optional(),
    messageTemplateId: vine.string().trim().uuid().optional(),
<<<<<<< HEAD
    headerMediaAssetId: vine.string().trim().uuid().optional(),
    scheduledAt: vine.date().optional(),
=======
    scheduledAt: scheduledAtString.optional(),
>>>>>>> feature/campaign-module
    status: vine.enum(CAMPAIGN_CREATE_STATUSES).optional(),
    variableMappings: campaignVariableMappingsSchema.optional(),
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

/**
 * Optional variable overrides for campaign preview.
 * When omitted, the linked template's `sampleValues` are used.
 */
export const previewCampaignValidator = vine.create(
  vine.object({
    variables: vine.record(vine.string()).optional(),
  })
)

/** Required future schedule datetime for POST /campaigns/:id/schedule. */
export const scheduleCampaignValidator = vine.create(
  vine.object({
    scheduledAt: scheduledAtString,
  })
)

/** Required status for PATCH /campaigns/:id/status — active lifecycle values only (excludes soft-delete). */
export const changeCampaignStatusValidator = vine.create(
  vine.object({
    status: vine.enum(CAMPAIGN_STATUSES),
  })
)

export const replaceCampaignRecipientsValidator = vine.create(
  vine.object({
    contactIds: vine.array(vine.string().trim().uuid()).optional(),
    tagId: vine.string().trim().uuid().optional(),
    variables: vine.record(vine.string()).optional(),
  })
)

/** Editable campaign fields only — counters, org, creator, and timestamps are immutable. */
export const updateCampaignValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200).optional(),
    whatsappConfigId: vine.string().trim().uuid().nullable().optional(),
    messageTemplateId: vine.string().trim().uuid().nullable().optional(),
<<<<<<< HEAD
    headerMediaAssetId: vine.string().trim().uuid().nullable().optional(),
    scheduledAt: vine.date().nullable().optional(),
=======
    scheduledAt: scheduledAtString.nullable().optional(),
>>>>>>> feature/campaign-module
    status: vine.enum(CAMPAIGN_CREATE_STATUSES).optional(),
    variableMappings: campaignVariableMappingsSchema.nullable().optional(),
  })
)
