import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import CampaignException from '#exceptions/campaign_exception'
import { MediaAssetReferenceRepository } from '#repositories/media_asset_reference_repository'
import {
  deriveParameterSchema,
  parseParameterSchema,
  pickRequiredParameterValues,
  TemplateParameterError,
} from '#lib/meta_whatsapp/template_parameters'
import type { TemplateParameterSchema } from '#lib/meta_whatsapp/types'
import {
  assertApprovedTemplate,
  assertConnectedWhatsappConfig,
  assertReadyMediaAsset,
} from '#services/campaign_preflight'
import { enqueueCampaignWake, removeCampaignWake } from '#services/campaign_queue'
import { NotificationService } from '#services/notification_service'
import type { CAMPAIGN_STATUSES } from '#validators/campaign'
import {
  CAMPAIGN_SORT_FIELDS,
  CAMPAIGN_SOFT_DELETED_STATUS,
  CAMPAIGN_SCHEDULABLE_STATUSES,
  CAMPAIGN_SENDABLE_STATUSES,
  CAMPAIGN_DRAFT_STATUS,
  CAMPAIGN_SCHEDULED_STATUS,
  CAMPAIGN_SENDING_STATUS,
} from '#validators/campaign'
import type { DateTime } from 'luxon'

const SENDABLE_STATUS_SET = new Set<string>(CAMPAIGN_SENDABLE_STATUSES)
const SCHEDULABLE_STATUS_SET = new Set<string>(CAMPAIGN_SCHEDULABLE_STATUSES)

export type CampaignLifecycleStatus = (typeof CAMPAIGN_STATUSES)[number]

/** Matches named (`{{customer_name}}`) and numbered (`{{1}}`) WhatsApp placeholders. */
const TEMPLATE_PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*\}\}/g

const TEMPLATE_PREVIEW_COLUMNS = [
  'id',
  'name',
  'category',
  'language',
  'headerType',
  'headerContent',
  'headerMediaUrl',
  'bodyText',
  'footerText',
  'buttons',
  'sampleValues',
  'parameterSchema',
  'status',
] as const

export type CampaignDto = {
  id: string
  organizationId: string
  createdByUserId: string | null
  name: string
  whatsappConfigId: string | null
  messageTemplateId: string | null
  headerMediaAssetId: string | null
  scheduledAt: string | null
  finalizedAt: string | null
  cancelledAt: string | null
  status: string
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  readCount: number
  repliedCount: number
  failedCount: number
  createdAt: string
  updatedAt: string | null
}

export type CreateCampaignInput = {
  organizationId: string
  actorUserId: string
  name: string
  whatsappConfigId?: string
  messageTemplateId?: string
  headerMediaAssetId?: string
  scheduledAt?: DateTime | Date
  status?: 'draft' | 'scheduled'
}

export type ListCampaignsInput = {
  organizationId: string
  page?: number
  limit?: number
  perPage?: number
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export type UpdateCampaignInput = {
  campaignId: string
  organizationId: string
  name?: string
  whatsappConfigId?: string | null
  messageTemplateId?: string | null
  headerMediaAssetId?: string | null
  scheduledAt?: DateTime | Date | null
  status?: 'draft' | 'scheduled'
}

export type PreviewCampaignInput = {
  campaignId: string
  organizationId: string
  /** Optional overrides; merged over the template's sampleValues. */
  variables?: Record<string, string>
}

export type CampaignPreviewDto = {
  campaignId: string
  campaignName: string
  campaignStatus: string
  messageTemplateId: string
  templateName: string
  templateStatus: string
  category: string
  language: string | null
  headerType: string | null
  headerMediaUrl: string | null
  variables: Record<string, string>
  parameterSchema: TemplateParameterSchema
  headerPreview: string | null
  bodyPreview: string
  footerPreview: string | null
  buttons: unknown
}

const SORT_FIELD_SET = new Set<string>(CAMPAIGN_SORT_FIELDS)
const RECIPIENT_INSERT_BATCH_SIZE = 5_000

/** Postgres foreign_key_violation, including Knex/Lucid-wrapped errors. */
function isForeignKeyViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: string }).code
    if (code === '23503') return true
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return false
}

function toJsDate(value: DateTime | Date): Date {
  return value instanceof Date ? value : value.toJSDate()
}

function toIso(value: DateTime | Date | string | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  const iso = value.toISO()
  if (!iso) return null
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : iso
}

function mapCampaignRow(row: Record<string, unknown>): CampaignDto {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    createdByUserId: (row.createdByUserId as string | null) ?? null,
    name: row.name as string,
    whatsappConfigId: (row.whatsappConfigId as string | null) ?? null,
    messageTemplateId: (row.messageTemplateId as string | null) ?? null,
    headerMediaAssetId: (row.headerMediaAssetId as string | null) ?? null,
    scheduledAt: toIso(row.scheduledAt as DateTime | Date | string | null),
    finalizedAt: toIso(row.finalizedAt as DateTime | Date | string | null),
    cancelledAt: toIso(row.cancelledAt as DateTime | Date | string | null),
    status: row.status as string,
    totalRecipients: Number(row.totalRecipients ?? 0),
    sentCount: Number(row.sentCount ?? 0),
    deliveredCount: Number(row.deliveredCount ?? 0),
    readCount: Number(row.readCount ?? 0),
    repliedCount: Number(row.repliedCount ?? 0),
    failedCount: Number(row.failedCount ?? 0),
    createdAt: toIso(row.createdAt as DateTime | Date | string)!,
    updatedAt: toIso(row.updatedAt as DateTime | Date | string | null),
  }
}

function parseJsonField(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

/** Normalize template sampleValues / request overrides into a string map. */
function toVariableMap(raw: unknown): Record<string, string> {
  const parsed = parseJsonField(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || value === undefined) continue
    out[key] = String(value)
  }
  return out
}

function contactTemplateValueCandidates(contact: {
  name: string | null
  email: string | null
  company: string | null
  phone: string
  customFields: unknown
}): Record<string, string> {
  const out: Record<string, string> = {}
  const set = (key: string, value: unknown) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    out[key] = trimmed
  }

  set('name', contact.name)
  set('first_name', contact.name)
  set('customer_name', contact.name)
  set('email', contact.email)
  set('company', contact.company)
  set('phone', contact.phone)

  for (const [key, value] of Object.entries(toVariableMap(contact.customFields))) {
    set(key, value)
  }

  return out
}

function resolveRecipientParameterValues(params: {
  schema: TemplateParameterSchema
  contact: {
    name: string | null
    email: string | null
    company: string | null
    phone: string
    customFields: unknown
  } | null
  overrides?: Record<string, string> | null
}): Record<string, string> {
  try {
    return pickRequiredParameterValues({
      schema: params.schema,
      values: {
        ...(params.contact ? contactTemplateValueCandidates(params.contact) : {}),
        ...(params.overrides ?? {}),
      },
    })
  } catch (error) {
    if (error instanceof TemplateParameterError) {
      throw CampaignException.missingTemplateParameters(error.message)
    }
    throw error
  }
}

/**
 * Replace `{{name}}` / `{{1}}` placeholders with configured variable values.
 * Unmatched placeholders are left intact so the client can spot gaps.
 */
function applyTemplateVariables(
  text: string | null | undefined,
  variables: Record<string, string>
): string | null {
  if (text === null) return null
  // The issue is that 'text' is possibly 'undefined' (see linter; if text is undefined, calling .replace will throw).
  // To fix, ensure 'text' is a string before calling .replace.
  return (typeof text === 'string' ? text : '').replace(
    TEMPLATE_PLACEHOLDER,
    (match, key: string) => {
      if (Object.prototype.hasOwnProperty.call(variables, key)) {
        return variables[key]
      }
      return match
    }
  )
}

const BROADCAST_COLUMNS = [
  'id',
  'organizationId',
  'createdByUserId',
  'name',
  'whatsappConfigId',
  'messageTemplateId',
  'headerMediaAssetId',
  'scheduledAt',
  'finalizedAt',
  'cancelledAt',
  'status',
  'totalRecipients',
  'sentCount',
  'deliveredCount',
  'readCount',
  'repliedCount',
  'failedCount',
  'createdAt',
  'updatedAt',
] as const

@inject()
export class CampaignService {
  constructor(
    protected mediaReferences: MediaAssetReferenceRepository = new MediaAssetReferenceRepository()
  ) {}

  /**
   * Load an active campaign row for the active org or throw not found.
   * Soft-deleted campaigns (status = deleted) are excluded.
   * Knex is used because DB columns are camelCase (Lucid emits snake_case).
   */
  protected async findCampaignRowOrFail(params: {
    campaignId: string
    organizationId: string
  }): Promise<Record<string, unknown>> {
    const row = await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .whereNot('status', CAMPAIGN_SOFT_DELETED_STATUS)
      .select([...BROADCAST_COLUMNS])
      .first()

    if (!row) {
      throw CampaignException.notFound()
    }

    return row
  }

  /**
   * Load a campaign row regardless of soft-delete state.
   */
  protected async findCampaignRowIncludingDeleted(params: {
    campaignId: string
    organizationId: string
  }): Promise<Record<string, unknown>> {
    const row = await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .select([...BROADCAST_COLUMNS])
      .first()

    if (!row) {
      throw CampaignException.notFound()
    }

    return row
  }

  protected async assertWhatsappConfigInOrg(organizationId: string, whatsappConfigId: string) {
    const config = await db
      .from('whatsapp_configs')
      .where('id', whatsappConfigId)
      .where('organizationId', organizationId)
      .select('id')
      .first()

    if (!config) {
      throw CampaignException.whatsappConfigNotFound()
    }
  }

  protected async assertMessageTemplateInOrg(organizationId: string, messageTemplateId: string) {
    const template = await db
      .from('message_templates')
      .where('id', messageTemplateId)
      .where('organizationId', organizationId)
      .select('id', 'whatsappConfigId')
      .first()

    if (!template) {
      throw CampaignException.messageTemplateNotFound()
    }

    return template as { id: string; whatsappConfigId: string | null }
  }

  protected async assertMediaAssetInOrg(organizationId: string, mediaAssetId: string) {
    const asset = await db
      .from('media_assets')
      .where('id', mediaAssetId)
      .where('organizationId', organizationId)
      .where('state', 'ready')
      .select('id')
      .first()

    if (!asset) {
      throw CampaignException.invalidReference()
    }
  }

  protected campaignTemplateSchema(template: Record<string, unknown>): TemplateParameterSchema {
    const stored = parseParameterSchema(parseJsonField(template.parameterSchema))
    if (stored.sendable || stored.unsupportedReason) {
      return stored
    }

    return deriveParameterSchema({
      headerType: (template.headerType as string | null) ?? null,
      headerContent: (template.headerContent as string | null) ?? null,
      bodyText: (template.bodyText as string) ?? '',
      buttons: parseJsonField(template.buttons),
    })
  }

  protected async loadCampaignTemplateSchema(params: {
    organizationId: string
    messageTemplateId: string
  }): Promise<TemplateParameterSchema> {
    const template = await db
      .from('message_templates')
      .where('id', params.messageTemplateId)
      .where('organizationId', params.organizationId)
      .whereNot('status', 'deleted')
      .select('id', 'headerType', 'headerContent', 'bodyText', 'buttons', 'parameterSchema')
      .first()

    if (!template) {
      throw CampaignException.messageTemplateNotFound()
    }

    const schema = this.campaignTemplateSchema(template)
    if (!schema.sendable) {
      throw CampaignException.templateNotSendable(schema.unsupportedReason)
    }
    return schema
  }

  protected async loadContactsByIds(params: {
    organizationId: string
    contactIds: string[]
  }): Promise<
    Map<
      string,
      {
        id: string
        name: string | null
        email: string | null
        company: string | null
        phone: string
        customFields: unknown
      }
    >
  > {
    const contacts = new Map<
      string,
      {
        id: string
        name: string | null
        email: string | null
        company: string | null
        phone: string
        customFields: unknown
      }
    >()

    for (let i = 0; i < params.contactIds.length; i += RECIPIENT_INSERT_BATCH_SIZE) {
      const batch = params.contactIds.slice(i, i + RECIPIENT_INSERT_BATCH_SIZE)
      const rows = await db
        .from('contacts')
        .where('organizationId', params.organizationId)
        .whereIn('id', batch)
        .select('id', 'name', 'email', 'company', 'phone', 'customFields')

      for (const row of rows) {
        contacts.set(row.id as string, {
          id: row.id as string,
          name: (row.name as string | null) ?? null,
          email: (row.email as string | null) ?? null,
          company: (row.company as string | null) ?? null,
          phone: row.phone as string,
          customFields: row.customFields,
        })
      }
    }

    return contacts
  }

  protected async assertRecipientVariablesReady(params: {
    organizationId: string
    campaignId: string
    messageTemplateId: string
  }): Promise<void> {
    const schema = await this.loadCampaignTemplateSchema(params)
    const required = [...schema.headerNames, ...schema.bodyNames]
    if (required.length === 0) {
      return
    }

    const recipients = await db
      .from('broadcast_recipients as r')
      .leftJoin('contacts as c', 'c.id', 'r.contactId')
      .where('r.organizationId', params.organizationId)
      .where('r.broadcastId', params.campaignId)
      .select('r.id', 'r.variables', 'c.name', 'c.email', 'c.company', 'c.phone', 'c.customFields')

    for (const row of recipients) {
      resolveRecipientParameterValues({
        schema,
        contact: row.phone
          ? {
              name: (row.name as string | null) ?? null,
              email: (row.email as string | null) ?? null,
              company: (row.company as string | null) ?? null,
              phone: row.phone as string,
              customFields: row.customFields,
            }
          : null,
        overrides: toVariableMap(row.variables),
      })
    }
  }

  protected async resolveTagAudienceContactIds(
    organizationId: string,
    tagId: string
  ): Promise<string[]> {
    const tag = await db
      .from('tags')
      .where('id', tagId)
      .where('organizationId', organizationId)
      .select('id')
      .first()
    if (!tag) {
      throw CampaignException.tagNotFound()
    }

    const rows = await db
      .from('contact_tags as ct')
      .innerJoin('contacts as c', 'c.id', 'ct.contactId')
      .where('ct.tagId', tagId)
      .where('ct.organizationId', organizationId)
      .where('c.organizationId', organizationId)
      .whereNull('c.deletedAt')
      .select('c.id')

    return [...new Set(rows.map((row) => row.id as string))]
  }

  /**
   * Fetch one campaign by id for the active organization.
   * Soft-deleted campaigns are not returned (404).
   */
  async getCampaignById(params: {
    campaignId: string
    organizationId: string
  }): Promise<CampaignDto> {
    const row = await this.findCampaignRowOrFail(params)
    return mapCampaignRow(row)
  }

  /**
   * Replace the recipient snapshot for a draft or scheduled campaign.
   * `tagId` resolves live tagged contacts; `contactIds` follows All Contacts rules.
   */
  async replaceRecipients(params: {
    organizationId: string
    campaignId: string
    contactIds?: string[]
    tagId?: string
    variables?: Record<string, string>
  }): Promise<CampaignDto> {
    const campaign = await this.findCampaignRowOrFail({
      campaignId: params.campaignId,
      organizationId: params.organizationId,
    })
    const status = campaign.status as string
    if (status !== CAMPAIGN_DRAFT_STATUS && status !== CAMPAIGN_SCHEDULED_STATUS) {
      throw CampaignException.notEditable(status)
    }

    let uniqueIds: string[]
    if (params.tagId) {
      uniqueIds = await this.resolveTagAudienceContactIds(params.organizationId, params.tagId)
    } else {
      uniqueIds = [...new Set(params.contactIds ?? [])]

      let foundCount = 0
      for (let i = 0; i < uniqueIds.length; i += RECIPIENT_INSERT_BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + RECIPIENT_INSERT_BATCH_SIZE)
        const found = await db
          .from('contacts')
          .where('organizationId', params.organizationId)
          .whereIn('id', batch)
          .count('* as total')
          .first()
        foundCount += Number((found as { total: number } | undefined)?.total ?? 0)
      }

      if (foundCount !== uniqueIds.length) {
        throw CampaignException.invalidReference()
      }
    }

    const messageTemplateId = campaign.messageTemplateId as string | null
    const schema = messageTemplateId
      ? await this.loadCampaignTemplateSchema({
          organizationId: params.organizationId,
          messageTemplateId,
        })
      : null
    const contacts = schema
      ? await this.loadContactsByIds({
          organizationId: params.organizationId,
          contactIds: uniqueIds,
        })
      : null

    const now = new Date()
    await db.transaction(async (trx) => {
      await trx
        .from('broadcast_recipients')
        .where('organizationId', params.organizationId)
        .where('broadcastId', params.campaignId)
        .delete()

      if (uniqueIds.length === 0) {
        await trx
          .from('broadcasts')
          .where('id', params.campaignId)
          .where('organizationId', params.organizationId)
          .update({ totalRecipients: 0 })
        return
      }

      for (let i = 0; i < uniqueIds.length; i += RECIPIENT_INSERT_BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + RECIPIENT_INSERT_BATCH_SIZE)
        await trx.table('broadcast_recipients').insert(
          batch.map((contactId) => ({
            organizationId: params.organizationId,
            broadcastId: params.campaignId,
            contactId,
            status: 'pending',
            variables: schema
              ? resolveRecipientParameterValues({
                  schema,
                  contact: contacts?.get(contactId) ?? null,
                  overrides: params.variables,
                })
              : (params.variables ?? null),
            createdAt: now,
          }))
        )
      }

      await trx
        .from('broadcasts')
        .where('id', params.campaignId)
        .where('organizationId', params.organizationId)
        .update({ totalRecipients: uniqueIds.length })
    })

    return this.getCampaignById({
      campaignId: params.campaignId,
      organizationId: params.organizationId,
    })
  }

  /**
   * Update only the campaign status field to an active lifecycle value.
   * Soft-deleted campaigns are treated as not found (404).
   * Lifecycle kickoff (sending / cancel / finalize) uses dedicated endpoints.
   * This PATCH only allows draft↔scheduled transitions.
   * updatedAt is maintained by the DB trigger `trg_set_updated_at`.
   */
  async changeCampaignStatus(params: {
    campaignId: string
    organizationId: string
    status: CampaignLifecycleStatus
  }): Promise<CampaignDto> {
    const existing = await this.findCampaignRowOrFail({
      campaignId: params.campaignId,
      organizationId: params.organizationId,
    })
    const from = existing.status as string
    const to = params.status

    const allowed =
      (from === 'draft' && (to === 'draft' || to === 'scheduled')) ||
      (from === 'scheduled' && (to === 'draft' || to === 'scheduled'))

    if (!allowed) {
      throw CampaignException.invalidStatusTransition(from, to)
    }

    // Knex (not Lucid .save) — DB columns are camelCase; Lucid emits snake_case.
    // Do not write updatedAt; trg_set_updated_at handles it.
    const [row] = await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .whereNot('status', CAMPAIGN_SOFT_DELETED_STATUS)
      .update({ status: params.status })
      .returning([...BROADCAST_COLUMNS])

    if (!row) {
      throw CampaignException.notFound()
    }

    return mapCampaignRow(row)
  }

  /**
   * Soft-delete a campaign without removing the row.
   * Uses status = deleted (`broadcasts` has no deletedAt column — same approach as subscriptions).
   */
  async softDeleteCampaign(params: {
    campaignId: string
    organizationId: string
  }): Promise<{ ok: true }> {
    const row = await this.findCampaignRowIncludingDeleted(params)

    if (row.status === CAMPAIGN_SOFT_DELETED_STATUS) {
      throw CampaignException.alreadyDeleted()
    }

    const updated = await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .whereNot('status', CAMPAIGN_SOFT_DELETED_STATUS)
      .update({ status: CAMPAIGN_SOFT_DELETED_STATUS })

    if (!updated) {
      throw CampaignException.notFound()
    }

    return { ok: true }
  }

  /**
   * Partial update of editable campaign fields.
   * Immutable: id, organizationId, createdByUserId, delivery counters, createdAt.
   * updatedAt is maintained by the DB trigger `trg_set_updated_at`.
   */
  async updateCampaign(input: UpdateCampaignInput): Promise<CampaignDto> {
    const existing = await this.findCampaignRowOrFail({
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    })

    const existingStatus = existing.status as string
    if (existingStatus !== 'draft' && existingStatus !== 'scheduled') {
      throw CampaignException.notEditable(existingStatus)
    }

    const updates: Record<string, unknown> = {}

    if (input.name !== undefined) {
      updates.name = input.name.trim()
    }

    if (input.whatsappConfigId !== undefined) {
      if (input.whatsappConfigId) {
        await this.assertWhatsappConfigInOrg(input.organizationId, input.whatsappConfigId)
      }
      updates.whatsappConfigId = input.whatsappConfigId
    }

    if (input.messageTemplateId !== undefined) {
      if (input.messageTemplateId) {
        const template = await this.assertMessageTemplateInOrg(
          input.organizationId,
          input.messageTemplateId
        )
        updates.messageTemplateId = input.messageTemplateId
        // Auto-fill from template when client omits whatsappConfigId (campaign send requires it).
        if (input.whatsappConfigId === undefined && template.whatsappConfigId) {
          await this.assertWhatsappConfigInOrg(input.organizationId, template.whatsappConfigId)
          updates.whatsappConfigId = template.whatsappConfigId
        }
      } else {
        updates.messageTemplateId = null
      }
    }

    if (input.headerMediaAssetId !== undefined) {
      if (input.headerMediaAssetId) {
        await this.assertMediaAssetInOrg(input.organizationId, input.headerMediaAssetId)
      }
      updates.headerMediaAssetId = input.headerMediaAssetId
    }

    if (input.scheduledAt !== undefined) {
      updates.scheduledAt = input.scheduledAt ? toJsDate(input.scheduledAt) : null
    }

    if (input.status !== undefined) {
      updates.status = input.status
    }

    const nextStatus = (updates.status as string | undefined) ?? (existing.status as string)
    const nextScheduledAt =
      input.scheduledAt !== undefined
        ? input.scheduledAt
          ? toJsDate(input.scheduledAt)
          : null
        : existing.scheduledAt
          ? new Date(existing.scheduledAt as string | Date)
          : null

    if (nextStatus === 'scheduled' && !nextScheduledAt) {
      throw CampaignException.scheduledAtRequired()
    }

    if (Object.keys(updates).length === 0) {
      return mapCampaignRow(existing)
    }

    try {
      // Knex (not Lucid .save) — DB columns are camelCase; Lucid emits snake_case.
      // Do not write createdAt; updatedAt is set by trg_set_updated_at.
      const [row] = await db
        .from('broadcasts')
        .where('id', input.campaignId)
        .where('organizationId', input.organizationId)
        .whereNot('status', CAMPAIGN_SOFT_DELETED_STATUS)
        .update(updates)
        .returning([...BROADCAST_COLUMNS])

      if (!row) {
        throw CampaignException.notFound()
      }

      return mapCampaignRow(row)
    } catch (error) {
      if (error instanceof CampaignException) {
        throw error
      }
      if (isForeignKeyViolation(error)) {
        throw CampaignException.invalidReference()
      }
      throw error
    }
  }

  /**
   * Paginated campaigns for the active organization.
   * Soft-deleted campaigns (status = deleted) are excluded.
   * Organization scope comes from the tenant (RLS + explicit organizationId filter).
   * Campaign type is not a column on `broadcasts`, so type filtering is unsupported.
   */
  async listCampaignsPaginated(input: ListCampaignsInput) {
    const page = input.page ?? 1
    const perPage = input.perPage ?? input.limit ?? 20
    const sortBy = input.sortBy && SORT_FIELD_SET.has(input.sortBy) ? input.sortBy : 'createdAt'
    const sortOrder = input.sortOrder === 'asc' ? 'asc' : 'desc'

    let query = db
      .from('broadcasts')
      .where('organizationId', input.organizationId)
      .whereNot('status', CAMPAIGN_SOFT_DELETED_STATUS)

    if (input.status) {
      query = query.where('status', input.status)
    }

    if (input.search) {
      const term = `%${input.search}%`
      query = query.whereILike('name', term)
    }

    const countResult = await query.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)

    const rows = await query
      .clone()
      .select([...BROADCAST_COLUMNS])
      .orderBy(sortBy, sortOrder)
      .offset((page - 1) * perPage)
      .limit(perPage)

    const lastPage = Math.ceil(total / perPage) || 1

    return {
      data: rows.map((row) => mapCampaignRow(row)),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage,
      },
    }
  }

  /**
   * Create a draft or scheduled campaign (broadcasts row) for the active organization.
   */
  async createCampaign(input: CreateCampaignInput): Promise<CampaignDto> {
    const name = input.name.trim()
    const scheduledAt = input.scheduledAt ? toJsDate(input.scheduledAt) : null
    const status = input.status ?? (scheduledAt ? 'scheduled' : 'draft')

    if (status === 'scheduled' && !scheduledAt) {
      throw CampaignException.scheduledAtRequired()
    }

    let whatsappConfigId = input.whatsappConfigId ?? null

    if (input.messageTemplateId) {
      const template = await this.assertMessageTemplateInOrg(
        input.organizationId,
        input.messageTemplateId
      )
      if (!whatsappConfigId && template.whatsappConfigId) {
        whatsappConfigId = template.whatsappConfigId
      }
    }

    if (whatsappConfigId) {
      await this.assertWhatsappConfigInOrg(input.organizationId, whatsappConfigId)
    }

    if (input.headerMediaAssetId) {
      await this.assertMediaAssetInOrg(input.organizationId, input.headerMediaAssetId)
    }

    try {
      // Knex (not Lucid .create) — DB columns are camelCase; Lucid emits snake_case.
      const [row] = await db
        .table('broadcasts')
        .insert({
          organizationId: input.organizationId,
          createdByUserId: input.actorUserId,
          name,
          whatsappConfigId,
          messageTemplateId: input.messageTemplateId ?? null,
          headerMediaAssetId: input.headerMediaAssetId ?? null,
          scheduledAt,
          status,
          totalRecipients: 0,
          sentCount: 0,
          deliveredCount: 0,
          readCount: 0,
          repliedCount: 0,
          failedCount: 0,
        })
        .returning([...BROADCAST_COLUMNS])

      return mapCampaignRow(row)
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw CampaignException.invalidReference()
      }
      throw error
    }
  }

  /**
   * Duplicate an existing campaign into a new draft row.
   * Does not copy id, createdAt, updatedAt, soft-delete status, schedule, or delivery counters.
   * Soft-deleted source campaigns are treated as not found (404).
   */
  async duplicateCampaign(params: {
    campaignId: string
    organizationId: string
    actorUserId: string
  }): Promise<CampaignDto> {
    const source = await this.findCampaignRowOrFail({
      campaignId: params.campaignId,
      organizationId: params.organizationId,
    })

    const whatsappConfigId = (source.whatsappConfigId as string | null) ?? null
    const messageTemplateId = (source.messageTemplateId as string | null) ?? null
    const headerMediaAssetId = (source.headerMediaAssetId as string | null) ?? null

    if (whatsappConfigId) {
      await this.assertWhatsappConfigInOrg(params.organizationId, whatsappConfigId)
    }
    if (messageTemplateId) {
      await this.assertMessageTemplateInOrg(params.organizationId, messageTemplateId)
    }
    if (headerMediaAssetId) {
      await this.assertMediaAssetInOrg(params.organizationId, headerMediaAssetId)
    }

    try {
      // Knex (not Lucid .create) — DB columns are camelCase; Lucid emits snake_case.
      // createdAt defaults via DB; updatedAt stays null until first update trigger.
      const [row] = await db
        .table('broadcasts')
        .insert({
          organizationId: params.organizationId,
          createdByUserId: params.actorUserId,
          name: source.name as string,
          whatsappConfigId,
          messageTemplateId,
          headerMediaAssetId,
          scheduledAt: null,
          status: CAMPAIGN_DRAFT_STATUS,
          totalRecipients: 0,
          sentCount: 0,
          deliveredCount: 0,
          readCount: 0,
          repliedCount: 0,
          failedCount: 0,
        })
        .returning([...BROADCAST_COLUMNS])

      return mapCampaignRow(row)
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw CampaignException.invalidReference()
      }
      throw error
    }
  }

  /**
   * Schedule (or reschedule) a campaign for a future `scheduledAt`.
   * Persists existing `scheduledAt` + `status = scheduled` fields only — no schema change.
   * Soft-deleted campaigns are treated as not found (404).
   * Requires an approved template and a connected WhatsApp configuration.
   */
  async scheduleCampaign(params: {
    campaignId: string
    organizationId: string
    scheduledAt: DateTime | Date
  }): Promise<CampaignDto> {
    const existing = await this.findCampaignRowOrFail({
      campaignId: params.campaignId,
      organizationId: params.organizationId,
    })
    const currentStatus = existing.status as string
    const previousScheduledAt = existing.scheduledAt
      ? new Date(existing.scheduledAt as string | Date)
      : null

    if (!SCHEDULABLE_STATUS_SET.has(currentStatus)) {
      throw CampaignException.notEligibleToSchedule(currentStatus)
    }

    if (Number(existing.totalRecipients ?? 0) < 1) {
      throw CampaignException.recipientsRequired()
    }

    if (!existing.messageTemplateId) {
      throw CampaignException.templateNotConfigured()
    }

    if (!existing.whatsappConfigId) {
      throw CampaignException.whatsappConfigNotConfigured()
    }

    await assertApprovedTemplate(params.organizationId, existing.messageTemplateId as string)
    await assertConnectedWhatsappConfig(params.organizationId, existing.whatsappConfigId as string)

    if (existing.headerMediaAssetId) {
      await assertReadyMediaAsset(params.organizationId, existing.headerMediaAssetId as string)
    }

    const scheduledAt = toJsDate(params.scheduledAt)
    if (scheduledAt.getTime() <= Date.now()) {
      throw CampaignException.scheduledAtMustBeFuture()
    }

    if (existing.messageTemplateId) {
      await this.assertRecipientVariablesReady({
        organizationId: params.organizationId,
        campaignId: params.campaignId,
        messageTemplateId: existing.messageTemplateId as string,
      })
    }

    // Conditional update avoids scheduling a campaign that left draft/scheduled mid-request.
    const [row] = await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .whereIn('status', [...CAMPAIGN_SCHEDULABLE_STATUSES])
      .update({
        scheduledAt,
        status: CAMPAIGN_SCHEDULED_STATUS,
      })
      .returning([...BROADCAST_COLUMNS])

    if (!row) {
      const latest = await this.findCampaignRowOrFail({
        campaignId: params.campaignId,
        organizationId: params.organizationId,
      })
      throw CampaignException.notEligibleToSchedule(latest.status as string)
    }

    try {
      await this.registerCampaignSchedule({
        organizationId: params.organizationId,
        campaignId: params.campaignId,
        scheduledAt,
      })
    } catch (error) {
      await db
        .from('broadcasts')
        .where('id', params.campaignId)
        .where('organizationId', params.organizationId)
        .where('status', CAMPAIGN_SCHEDULED_STATUS)
        .update({
          status:
            currentStatus === CAMPAIGN_SCHEDULED_STATUS
              ? CAMPAIGN_SCHEDULED_STATUS
              : CAMPAIGN_DRAFT_STATUS,
          scheduledAt: currentStatus === CAMPAIGN_SCHEDULED_STATUS ? previousScheduledAt : null,
        })
      logger.error(
        {
          campaignId: params.campaignId,
          organizationId: params.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'campaigns.enqueue_failed'
      )
      throw error
    }

    await this.#protectHeaderMedia({
      organizationId: params.organizationId,
      campaignId: params.campaignId,
      headerMediaAssetId: (row.headerMediaAssetId as string | null) ?? null,
    })

    await this.notifyCreatorBestEffort({
      organizationId: params.organizationId,
      createdByUserId: (row.createdByUserId as string | null) ?? null,
      type: 'campaign_scheduled',
      title: 'Campaign scheduled',
      body: `“${row.name as string}” is scheduled for ${scheduledAt.toISOString()}.`,
      campaignId: params.campaignId,
    })

    return mapCampaignRow(row)
  }

  /**
   * Enqueue delayed campaign execute job for a future schedule.
   */
  protected async registerCampaignSchedule(params: {
    organizationId: string
    campaignId: string
    scheduledAt: Date
  }): Promise<void> {
    await enqueueCampaignWake({
      organizationId: params.organizationId,
      campaignId: params.campaignId,
      runAt: params.scheduledAt,
    })
  }

  /**
   * Cancel a scheduled campaign: revert to draft and clear `scheduledAt`.
   * Soft-deleted campaigns are treated as not found (404).
   * In-progress (`sending`) campaigns use cancelInProgressCampaign instead.
   */
  async cancelScheduledCampaign(params: {
    campaignId: string
    organizationId: string
  }): Promise<CampaignDto> {
    const existing = await this.findCampaignRowOrFail(params)
    const currentStatus = existing.status as string

    if (currentStatus !== CAMPAIGN_SCHEDULED_STATUS) {
      throw CampaignException.notEligibleToCancel(currentStatus)
    }

    // Conditional update prevents canceling a campaign that left scheduled mid-request.
    const [row] = await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .where('status', CAMPAIGN_SCHEDULED_STATUS)
      .update({
        status: CAMPAIGN_DRAFT_STATUS,
        scheduledAt: null,
        cancelledAt: null,
      })
      .returning([...BROADCAST_COLUMNS])

    if (!row) {
      const latest = await this.findCampaignRowOrFail(params)
      throw CampaignException.notEligibleToCancel(latest.status as string)
    }

    await this.unregisterCampaignSchedule({
      organizationId: params.organizationId,
      campaignId: params.campaignId,
    })

    await this.notifyCreatorBestEffort({
      organizationId: params.organizationId,
      createdByUserId: (row.createdByUserId as string | null) ?? null,
      type: 'campaign_cancelled',
      title: 'Campaign cancelled',
      body: `Scheduled campaign “${row.name as string}” was cancelled and returned to draft.`,
      campaignId: params.campaignId,
    })

    return mapCampaignRow(row)
  }

  /**
   * Drop the delayed campaign execute job when a schedule is cancelled.
   * BullMQ jobId = campaignId; executeCampaign still no-ops if status is draft.
   */
  protected async unregisterCampaignSchedule(params: {
    organizationId: string
    campaignId: string
  }): Promise<void> {
    await removeCampaignWake(params)
  }

  /**
   * Kick off campaign send: mark as `sending` ("running") when eligible, then enqueue fan-out.
   * Soft-deleted campaigns are treated as not found (404).
   * Requires an approved template and a connected WhatsApp configuration.
   */
  async sendCampaign(params: { campaignId: string; organizationId: string }): Promise<CampaignDto> {
    const existing = await this.findCampaignRowOrFail(params)
    const currentStatus = existing.status as string

    if (!SENDABLE_STATUS_SET.has(currentStatus)) {
      throw CampaignException.notEligibleToSend(currentStatus)
    }

    if (!existing.messageTemplateId) {
      throw CampaignException.templateNotConfigured()
    }

    if (!existing.whatsappConfigId) {
      throw CampaignException.whatsappConfigNotConfigured()
    }

    if (Number(existing.totalRecipients ?? 0) < 1) {
      throw CampaignException.recipientsRequired()
    }

    await assertApprovedTemplate(params.organizationId, existing.messageTemplateId as string)
    await assertConnectedWhatsappConfig(params.organizationId, existing.whatsappConfigId as string)

    if (existing.headerMediaAssetId) {
      await assertReadyMediaAsset(params.organizationId, existing.headerMediaAssetId as string)
    }

    await this.assertRecipientVariablesReady({
      organizationId: params.organizationId,
      campaignId: params.campaignId,
      messageTemplateId: existing.messageTemplateId as string,
    })

    // Conditional update prevents racing a second send into `sending`.
    const [row] = await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .whereIn('status', [...CAMPAIGN_SENDABLE_STATUSES])
      .update({ status: CAMPAIGN_SENDING_STATUS })
      .returning([...BROADCAST_COLUMNS])

    if (!row) {
      const latest = await this.findCampaignRowOrFail(params)
      throw CampaignException.notEligibleToSend(latest.status as string)
    }

    try {
      await this.enqueueCampaignSend({
        organizationId: params.organizationId,
        campaignId: params.campaignId,
      })
    } catch (error) {
      await db
        .from('broadcasts')
        .where('id', params.campaignId)
        .where('organizationId', params.organizationId)
        .where('status', CAMPAIGN_SENDING_STATUS)
        .update({
          status: currentStatus,
          scheduledAt: existing.scheduledAt ?? null,
        })
      logger.error(
        {
          campaignId: params.campaignId,
          organizationId: params.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'campaigns.enqueue_failed'
      )
      throw error
    }

    await this.#protectHeaderMedia({
      organizationId: params.organizationId,
      campaignId: params.campaignId,
      headerMediaAssetId: (row.headerMediaAssetId as string | null) ?? null,
    })

    await this.notifyCreatorBestEffort({
      organizationId: params.organizationId,
      createdByUserId: (row.createdByUserId as string | null) ?? null,
      type: 'campaign_started',
      title: 'Campaign started',
      body: `“${row.name as string}” has started sending.`,
      campaignId: params.campaignId,
    })

    return mapCampaignRow(row)
  }

  /**
   * Enqueue immediate campaign execute fan-out via WhatsappOutboundService per recipient.
   */
  protected async enqueueCampaignSend(params: {
    organizationId: string
    campaignId: string
  }): Promise<void> {
    await enqueueCampaignWake({
      organizationId: params.organizationId,
      campaignId: params.campaignId,
    })
  }

  async #protectHeaderMedia(params: {
    organizationId: string
    campaignId: string
    headerMediaAssetId: string | null
  }): Promise<void> {
    if (!params.headerMediaAssetId) return
    await this.mediaReferences.upsert({
      organizationId: params.organizationId,
      mediaAssetId: params.headerMediaAssetId,
      ownerType: 'campaign',
      ownerId: params.campaignId,
      protectedUntil: null,
    })
  }

  /**
   * Best-effort lifecycle notification for the campaign creator.
   * Skips when createdByUserId is null. Never throws — campaign flow must not fail on notify.
   */
  async notifyCreatorBestEffort(params: {
    organizationId: string
    createdByUserId: string | null
    type: string
    title: string
    body: string
    campaignId: string
  }): Promise<void> {
    if (!params.createdByUserId) return

    try {
      await new NotificationService().createNotification({
        organizationId: params.organizationId,
        userId: params.createdByUserId,
        type: params.type,
        title: params.title,
        body: params.body,
      })
    } catch (error) {
      logger.error(
        {
          campaignId: params.campaignId,
          organizationId: params.organizationId,
          type: params.type,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'campaigns.notification_failed'
      )
    }
  }

  /**
   * Build a read-only campaign message preview.
   * Does not send WhatsApp messages and does not mutate campaign status/counters.
   * Uses the linked template's sampleValues, optionally overridden by request variables.
   */
  async previewCampaign(input: PreviewCampaignInput): Promise<CampaignPreviewDto> {
    const campaign = await this.findCampaignRowOrFail({
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    })

    const messageTemplateId = campaign.messageTemplateId as string | null
    if (!messageTemplateId) {
      throw CampaignException.templateNotConfigured()
    }

    const template = await db
      .from('message_templates')
      .where('id', messageTemplateId)
      .where('organizationId', input.organizationId)
      .whereNot('status', 'deleted')
      .select([...TEMPLATE_PREVIEW_COLUMNS])
      .first()

    if (!template) {
      throw CampaignException.messageTemplateNotFound()
    }

    const sampleVariables = toVariableMap(template.sampleValues)
    const variables = {
      ...sampleVariables,
      ...(input.variables ?? {}),
    }

    const headerType = (template.headerType as string | null) ?? null
    const headerContent = (template.headerContent as string | null) ?? null
    const bodyText = template.bodyText as string
    const footerText = (template.footerText as string | null) ?? null

    return {
      campaignId: campaign.id as string,
      campaignName: campaign.name as string,
      campaignStatus: campaign.status as string,
      messageTemplateId: template.id as string,
      templateName: template.name as string,
      templateStatus: template.status as string,
      category: template.category as string,
      language: (template.language as string | null) ?? null,
      headerType,
      headerMediaUrl: (template.headerMediaUrl as string | null) ?? null,
      variables,
      parameterSchema: parseParameterSchema(parseJsonField(template.parameterSchema)),
      headerPreview:
        headerType?.toLowerCase() === 'text'
          ? applyTemplateVariables(headerContent, variables)
          : headerContent,
      bodyPreview: applyTemplateVariables(bodyText, variables)!,
      footerPreview: applyTemplateVariables(footerText, variables),
      buttons: parseJsonField(template.buttons) ?? null,
    }
  }
}
