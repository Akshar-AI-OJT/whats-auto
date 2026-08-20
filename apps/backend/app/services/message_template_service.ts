import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import MessageTemplateException from '#exceptions/message_template_exception'
import { decryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { createMetaGraphClient, type MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { deriveParameterSchema, parseParameterSchema } from '#lib/meta_whatsapp/template_parameters'
import type {
  MetaTemplateComponent,
  MetaMessageTemplateItem,
  TemplateParameterSchema,
} from '#lib/meta_whatsapp/types'
import { NotificationService } from '#services/notification_service'

export type MessageTemplateDto = {
  id: string
  organizationId: string
  whatsappConfigId: string | null
  createdByUserId: string | null
  name: string
  category: string
  language: string
  headerType: string | null
  headerContent: string | null
  headerMediaUrl: string | null
  bodyText: string
  footerText: string | null
  buttons: unknown
  sampleValues: unknown
  parameterSchema: TemplateParameterSchema
  status: string
  metaTemplateId: string | null
  rejectionReason: string | null
  qualityScore: string | null
  submissionError: string | null
  lastSubmittedAt: string | null
  createdAt: string
  updatedAt: string | null
}

export type CreateMessageTemplateInput = {
  organizationId: string
  userId?: string
  name: string
  category: string
  language: string
  headerType?: string
  headerContent?: string
  bodyText: string
  footerText?: string
  buttons?: Array<Record<string, unknown>>
  sampleValues?: unknown
}

export class MessageTemplateService {
  constructor(protected graphClient: MetaGraphClient = createMetaGraphClient()) {}

  toDto(row: Record<string, any>): MessageTemplateDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      whatsappConfigId: row.whatsappConfigId ?? null,
      createdByUserId: row.createdByUserId ?? null,
      name: row.name,
      category: row.category,
      language: row.language ?? 'en_US',
      headerType: row.headerType ?? null,
      headerContent: row.headerContent ?? null,
      headerMediaUrl: row.headerMediaUrl ?? null,
      bodyText: row.bodyText,
      footerText: row.footerText ?? null,
      buttons: typeof row.buttons === 'string' ? JSON.parse(row.buttons) : (row.buttons ?? null),
      sampleValues:
        typeof row.sampleValues === 'string'
          ? JSON.parse(row.sampleValues)
          : (row.sampleValues ?? null),
      parameterSchema: parseParameterSchema(this.#jsonField(row.parameterSchema)),
      status: row.status,
      metaTemplateId: row.metaTemplateId ?? null,
      rejectionReason: row.rejectionReason ?? null,
      qualityScore: row.qualityScore ?? null,
      submissionError: row.submissionError ?? null,
      lastSubmittedAt: row.lastSubmittedAt ? new Date(row.lastSubmittedAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }
  }

  #jsonField(value: unknown): unknown {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }
    return value
  }

  #parameterSchemaJson(params: {
    headerType?: string | null
    headerContent?: string | null
    bodyText: string
    buttons?: unknown
  }): string {
    return JSON.stringify(deriveParameterSchema(params))
  }

  /**
   * List templates paginated for the active organization.
   */
  async listTemplatesPaginated(params: {
    page?: number
    perPage?: number
    status?: string
    category?: string
    search?: string
  }) {
    const page = params.page ?? 1
    const perPage = params.perPage ?? 20

    let query = db.from('message_templates')

    if (params.status) {
      query = query.where('status', params.status.toLowerCase())
    }

    if (params.category) {
      query = query.where('category', params.category.toUpperCase())
    }

    if (params.search) {
      const term = `%${params.search}%`
      query = query.where((q) => {
        q.whereILike('name', term).orWhereILike('bodyText', term)
      })
    }

    const countResult = await query.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)

    const rows = await query
      .orderBy('createdAt', 'desc')
      .offset((page - 1) * perPage)
      .limit(perPage)

    const lastPage = Math.ceil(total / perPage) || 1

    return {
      data: rows.map((r) => this.toDto(r)),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage,
      },
    }
  }

  /**
   * Fetch a single message template by ID.
   */
  async getTemplateById(id: string): Promise<MessageTemplateDto> {
    const row = await db.from('message_templates').where('id', id).first()
    if (!row) {
      throw MessageTemplateException.notFound()
    }
    return this.toDto(row)
  }

  /**
   * Sync message templates from Meta WABA account into local database.
   * Uses GET /{waba-id}/message_templates and follows Graph cursor pagination
   * until all pages are consumed (a single page alone can miss templates).
   */
  async syncTemplatesFromMeta(organizationId: string): Promise<{ syncedCount: number }> {
    const configRow = await db
      .from('whatsapp_configs')
      .where('organizationId', organizationId)
      .where('status', 'connected')
      .first()

    if (!configRow || !configRow.wabaId || !configRow.accessToken) {
      throw MessageTemplateException.noActiveWhatsappConfig()
    }

    if (!this.graphClient.listMessageTemplates) {
      return { syncedCount: 0 }
    }

    const accessToken = decryptWhatsappAccessToken(configRow.accessToken)
    const templates = await this.#listAllMessageTemplatesFromMeta({
      wabaId: configRow.wabaId,
      accessToken,
    })

    for (const metaTpl of templates) {
      const headerComp = metaTpl.components?.find((c) => c.type === 'HEADER')
      const bodyComp = metaTpl.components?.find((c) => c.type === 'BODY')
      const footerComp = metaTpl.components?.find((c) => c.type === 'FOOTER')
      const buttonsComp = metaTpl.components?.find((c) => c.type === 'BUTTONS')

      const headerType = headerComp?.format
        ? headerComp.format.toLowerCase()
        : headerComp?.text
          ? 'text'
          : null
      const headerContent = headerComp?.text ?? null
      const bodyText = bodyComp?.text ?? ''
      const footerText = footerComp?.text ?? null
      const buttons = buttonsComp?.buttons ?? null

      const existing = await db
        .from('message_templates')
        .where('organizationId', organizationId)
        .where('name', metaTpl.name)
        .whereRaw("COALESCE(language, '') = COALESCE(?, '')", [metaTpl.language])
        .first()

      const payload = {
        organizationId,
        whatsappConfigId: configRow.id,
        name: metaTpl.name,
        category: metaTpl.category.toUpperCase(),
        language: metaTpl.language,
        headerType,
        headerContent,
        bodyText,
        footerText,
        buttons: buttons ? JSON.stringify(buttons) : null,
        parameterSchema: this.#parameterSchemaJson({
          headerType,
          headerContent,
          bodyText,
          buttons,
        }),
        status: metaTpl.status.toLowerCase(),
        metaTemplateId: metaTpl.id ?? null,
        rejectionReason: metaTpl.rejected_reason ?? null,
        qualityScore: metaTpl.quality_score?.score ?? null,
        lastSubmittedAt: new Date(),
        updatedAt: new Date(),
      }

      if (existing) {
        const previousStatus = String(existing.status ?? '').toLowerCase()
        await db.from('message_templates').where('id', existing.id).update(payload)

        await this.#notifyTemplateStatusTransitionBestEffort({
          organizationId,
          createdByUserId: (existing.createdByUserId as string | null) ?? null,
          templateName: metaTpl.name,
          previousStatus,
          nextStatus: payload.status,
          rejectionReason: payload.rejectionReason,
        })
      } else {
        await db.table('message_templates').insert({
          ...payload,
          createdAt: new Date(),
        })
      }
    }

    return { syncedCount: templates.length }
  }

  async #listAllMessageTemplatesFromMeta(params: {
    wabaId: string
    accessToken: string
  }): Promise<MetaMessageTemplateItem[]> {
    const pageLimit = 100
    const maxPages = 50
    const all: MetaMessageTemplateItem[] = []
    let after: string | undefined
    let pages = 0

    while (pages < maxPages) {
      const result = await this.graphClient.listMessageTemplates!({
        wabaId: params.wabaId,
        accessToken: params.accessToken,
        limit: pageLimit,
        after,
      })
      const page = result.data ?? []
      all.push(...page)
      pages += 1

      after = result.paging?.cursors?.after
      if (!after && result.paging?.next) {
        try {
          after = new URL(result.paging.next).searchParams.get('after') ?? undefined
        } catch {
          after = undefined
        }
      }

      if (page.length === 0 || !after) break
    }

    return all
  }

  /**
   * Best-effort notify on Meta sync status transitions into approved/rejected.
   * Recipient: existing createdByUserId only (no invented owner fallback). Never throws.
   */
  async #notifyTemplateStatusTransitionBestEffort(params: {
    organizationId: string
    createdByUserId: string | null
    templateName: string
    previousStatus: string
    nextStatus: string
    rejectionReason: string | null
  }): Promise<void> {
    const becameApproved = params.previousStatus !== 'approved' && params.nextStatus === 'approved'
    const becameRejected = params.previousStatus !== 'rejected' && params.nextStatus === 'rejected'

    if (!becameApproved && !becameRejected) return

    const type = becameApproved ? 'message_template_approved' : 'message_template_rejected'
    const title = becameApproved ? 'Message template approved' : 'Message template rejected'

    if (!params.createdByUserId) {
      logger.warn(
        {
          organizationId: params.organizationId,
          type,
          templateName: params.templateName,
        },
        'message_templates.notification_skipped_no_recipient'
      )
      return
    }

    try {
      const body = becameApproved
        ? `Your message template "${params.templateName}" was approved.`
        : params.rejectionReason
          ? `Your message template "${params.templateName}" was rejected: ${params.rejectionReason}.`
          : `Your message template "${params.templateName}" was rejected.`

      await new NotificationService().createNotification({
        organizationId: params.organizationId,
        userId: params.createdByUserId,
        type,
        title,
        body,
        actorUserId: null,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          userId: params.createdByUserId,
          type,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'message_templates.notification_failed'
      )
    }
  }

  /**
   * Create message template locally and submit to Meta Graph API.
   */
  async createTemplate(payload: CreateMessageTemplateInput): Promise<MessageTemplateDto> {
    const name = payload.name.toLowerCase().trim()
    const category = payload.category.toUpperCase().trim()
    const language = payload.language.trim()

    // Check duplicate
    const existing = await db
      .from('message_templates')
      .where('organizationId', payload.organizationId)
      .where('name', name)
      .whereRaw("COALESCE(language, '') = COALESCE(?, '')", [language])
      .first()

    if (existing) {
      throw MessageTemplateException.duplicateName(name, language)
    }

    // Get active WABA config if available
    const configRow = await db
      .from('whatsapp_configs')
      .where('organizationId', payload.organizationId)
      .where('status', 'connected')
      .first()

    // Construct Meta components
    const metaComponents: MetaTemplateComponent[] = []

    if (payload.headerType && payload.headerType.toUpperCase() !== 'NONE') {
      const format = payload.headerType.toUpperCase()
      if (format === 'TEXT' && payload.headerContent) {
        metaComponents.push({
          type: 'HEADER',
          format: 'TEXT',
          text: payload.headerContent,
        })
      } else if (['IMAGE', 'DOCUMENT'].includes(format)) {
        metaComponents.push({
          type: 'HEADER',
          format,
        })
      }
    }

    metaComponents.push({
      type: 'BODY',
      text: payload.bodyText,
    })

    if (payload.footerText) {
      metaComponents.push({
        type: 'FOOTER',
        text: payload.footerText,
      })
    }

    if (payload.buttons && payload.buttons.length > 0) {
      metaComponents.push({
        type: 'BUTTONS',
        buttons: payload.buttons,
      })
    }

    let metaTemplateId: string | null = null
    let status = 'pending'
    let submissionError: string | null = null

    if (configRow && configRow.wabaId && configRow.accessToken) {
      try {
        const accessToken = decryptWhatsappAccessToken(configRow.accessToken)
        if (this.graphClient.createMessageTemplate) {
          const metaRes = await this.graphClient.createMessageTemplate({
            wabaId: configRow.wabaId,
            accessToken,
            name,
            category,
            language,
            components: metaComponents,
          })
          metaTemplateId = metaRes.id
          if (metaRes.status) {
            status = metaRes.status.toLowerCase()
          }
        }
      } catch (err: any) {
        submissionError = err.message ?? 'Meta API error'
        status = 'rejected'
      }
    } else {
      status = 'draft'
    }

    const headerType = payload.headerType?.toLowerCase() ?? null
    const headerContent = payload.headerContent ?? null
    const buttons = payload.buttons ?? null

    const [row] = await db
      .table('message_templates')
      .insert({
        organizationId: payload.organizationId,
        whatsappConfigId: configRow?.id ?? null,
        createdByUserId: payload.userId ?? null,
        name,
        category,
        language,
        headerType,
        headerContent,
        bodyText: payload.bodyText,
        footerText: payload.footerText ?? null,
        buttons: buttons ? JSON.stringify(buttons) : null,
        sampleValues: payload.sampleValues ? JSON.stringify(payload.sampleValues) : null,
        parameterSchema: this.#parameterSchemaJson({
          headerType,
          headerContent,
          bodyText: payload.bodyText,
          buttons,
        }),
        status,
        metaTemplateId,
        submissionError,
        lastSubmittedAt: configRow ? new Date() : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*')

    return this.toDto(row)
  }

  /**
   * Delete message template locally and from Meta.
   */
  async deleteTemplate(id: string): Promise<{ ok: boolean }> {
    const row = await db.from('message_templates').where('id', id).first()
    if (!row) {
      throw MessageTemplateException.notFound()
    }

    const configRow = await db
      .from('whatsapp_configs')
      .where('organizationId', row.organizationId)
      .where('status', 'connected')
      .first()

    if (configRow && configRow.wabaId && configRow.accessToken && row.name) {
      try {
        const accessToken = decryptWhatsappAccessToken(configRow.accessToken)
        if (this.graphClient.deleteMessageTemplate) {
          await this.graphClient.deleteMessageTemplate({
            wabaId: configRow.wabaId,
            accessToken,
            name: row.name,
          })
        }
      } catch {
        // Continue to delete local record even if Meta delete throws or was already removed
      }
    }

    await db.from('message_templates').where('id', id).delete()
    return { ok: true }
  }
}
