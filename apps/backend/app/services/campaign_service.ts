import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'
import { parseParameterSchema } from '#lib/meta_whatsapp/template_parameters'
import type { TemplateParameterSchema } from '#lib/meta_whatsapp/types'
import {
  CAMPAIGN_DRAFT_STATUS,
  CAMPAIGN_SCHEDULABLE_STATUSES,
  CAMPAIGN_SCHEDULED_STATUS,
  CAMPAIGN_SENDABLE_STATUSES,
  CAMPAIGN_SENDING_STATUS,
  CAMPAIGN_SOFT_DELETED_STATUS,
  CAMPAIGN_SORT_FIELDS,
  CAMPAIGN_STATUSES,
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
  scheduledAt: string | null
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
  if (typeof value === 'string') return new Date(value).toISOString()
  if (value instanceof Date) return value.toISOString()
  return value.toISO()
}

function mapCampaignRow(row: Record<string, unknown>): CampaignDto {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    createdByUserId: (row.createdByUserId as string | null) ?? null,
    name: row.name as string,
    whatsappConfigId: (row.whatsappConfigId as string | null) ?? null,
    messageTemplateId: (row.messageTemplateId as string | null) ?? null,
    scheduledAt: toIso(row.scheduledAt as DateTime | Date | string | null),
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

/**
 * Replace `{{name}}` / `{{1}}` placeholders with configured variable values.
 * Unmatched placeholders are left intact so the client can spot gaps.
 */
function applyTemplateVariables(
  text: string | null | undefined,
  variables: Record<string, string>
): string | null {
  if (text == null) return null
  return text.replace(TEMPLATE_PLACEHOLDER, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return variables[key]
    }
    return match
  })
}

const BROADCAST_COLUMNS = [
  'id',
  'organizationId',
  'createdByUserId',
  'name',
  'whatsappConfigId',
  'messageTemplateId',
  'scheduledAt',
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

export class CampaignService {
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
      .select('id')
      .first()

    if (!template) {
      throw CampaignException.messageTemplateNotFound()
    }
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
   * Update only the campaign status field to an active lifecycle value.
   * Soft-deleted campaigns are treated as not found (404).
   * No cross-status transition matrix exists for this endpoint — dedicated
   * send/schedule/cancel APIs keep their own eligibility rules.
   * updatedAt is maintained by the DB trigger `trg_set_updated_at`.
   */
  async changeCampaignStatus(params: {
    campaignId: string
    organizationId: string
    status: CampaignLifecycleStatus
  }): Promise<CampaignDto> {
    await this.findCampaignRowOrFail({
      campaignId: params.campaignId,
      organizationId: params.organizationId,
    })

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
        await this.assertMessageTemplateInOrg(input.organizationId, input.messageTemplateId)
      }
      updates.messageTemplateId = input.messageTemplateId
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
    const perPage = input.limit ?? input.perPage ?? 20
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

    if (input.whatsappConfigId) {
      await this.assertWhatsappConfigInOrg(input.organizationId, input.whatsappConfigId)
    }

    if (input.messageTemplateId) {
      await this.assertMessageTemplateInOrg(input.organizationId, input.messageTemplateId)
    }

    try {
      // Knex (not Lucid .create) — DB columns are camelCase; Lucid emits snake_case.
      const [row] = await db
        .table('broadcasts')
        .insert({
          organizationId: input.organizationId,
          createdByUserId: input.actorUserId,
          name,
          whatsappConfigId: input.whatsappConfigId ?? null,
          messageTemplateId: input.messageTemplateId ?? null,
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

    if (whatsappConfigId) {
      await this.assertWhatsappConfigInOrg(params.organizationId, whatsappConfigId)
    }
    if (messageTemplateId) {
      await this.assertMessageTemplateInOrg(params.organizationId, messageTemplateId)
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

    if (!SCHEDULABLE_STATUS_SET.has(currentStatus)) {
      throw CampaignException.notEligibleToSchedule(currentStatus)
    }

    const scheduledAt = toJsDate(params.scheduledAt)
    if (scheduledAt.getTime() <= Date.now()) {
      throw CampaignException.scheduledAtMustBeFuture()
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

    await this.registerCampaignSchedule({
      organizationId: params.organizationId,
      campaignId: params.campaignId,
      scheduledAt,
    })

    return mapCampaignRow(row)
  }

  /**
   * Placeholder for future campaign scheduler integration.
   * Job queue (pg-boss) exists for WhatsApp outbound / billing, but there is no
   * campaign schedule job yet. Hook registration here when `JOB_NAMES` gains one.
   */
  protected async registerCampaignSchedule(_params: {
    organizationId: string
    campaignId: string
    scheduledAt: Date
  }): Promise<void> {
    // Future: register a delayed job to call sendCampaign (or fan-out) at scheduledAt.
  }

  /**
   * Cancel a scheduled campaign: revert to draft and clear `scheduledAt`.
   * There is no "cancelled" status on `broadcasts` — draft is the lifecycle equivalent.
   * Soft-deleted campaigns are treated as not found (404).
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

    return mapCampaignRow(row)
  }

  /**
   * Placeholder for removing a future campaign schedule job.
   * No campaign schedule job exists yet — hook unschedule/cancel here when wired.
   */
  protected async unregisterCampaignSchedule(_params: {
    organizationId: string
    campaignId: string
  }): Promise<void> {
    // Future: cancel/remove the delayed job registered by registerCampaignSchedule.
  }

  /**
   * Kick off campaign send: mark as `sending` ("running") when eligible.
   * Does not deliver WhatsApp messages yet — broadcast fan-out is a future queue job.
   * Soft-deleted campaigns are treated as not found (404).
   */
  async sendCampaign(params: {
    campaignId: string
    organizationId: string
  }): Promise<CampaignDto> {
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

    await this.assertMessageTemplateInOrg(
      params.organizationId,
      existing.messageTemplateId as string
    )
    await this.assertWhatsappConfigInOrg(
      params.organizationId,
      existing.whatsappConfigId as string
    )

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

    await this.enqueueCampaignSend({
      organizationId: params.organizationId,
      campaignId: params.campaignId,
    })

    return mapCampaignRow(row)
  }

  /**
   * Placeholder for future campaign broadcast queue integration.
   * Per-conversation outbound (`WhatsappOutboundService` + pg-boss) exists, but there is
   * no campaign/broadcast fan-out job yet. Hook enqueue here when `JOB_NAMES` gains one.
   */
  protected async enqueueCampaignSend(_params: {
    organizationId: string
    campaignId: string
  }): Promise<void> {
    // Future: enqueue campaign broadcast worker to process `broadcast_recipients`
    // via WhatsappOutboundService.queueTemplate (or equivalent) per recipient.
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
