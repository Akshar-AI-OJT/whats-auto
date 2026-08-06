import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'
import {
  CAMPAIGN_SOFT_DELETED_STATUS,
  CAMPAIGN_SORT_FIELDS,
} from '#validators/campaign'
import type { DateTime } from 'luxon'

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
}
