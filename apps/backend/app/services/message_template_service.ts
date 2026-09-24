import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import MessageTemplateException from '#exceptions/message_template_exception'
import { decryptWhatsappAccessToken } from '#lib/meta_whatsapp/access_token_crypto'
import { createMetaGraphClient, type MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import {
  deriveParameterSchema,
  resolveParameterSchema,
} from '#lib/meta_whatsapp/template_parameters'
import type {
  MetaTemplateComponent,
  MetaMessageTemplateItem,
  TemplateParameterSchema,
} from '#lib/meta_whatsapp/types'
import { NotificationService } from '#services/notification_service'
import { PlanEnforcementService } from '#services/billing/plan_enforcement_service'
import { ObjectStorage } from '#services/object_storage/contracts/object_storage'
import { runWithTenant } from '#services/tenant_context'

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
  catalogTemplateId: string | null
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
  headerMediaAssetId?: string
  headerMediaUrl?: string
  bodyText: string
  footerText?: string
  buttons?: Array<Record<string, unknown>>
  sampleValues?: unknown
  catalogTemplateId?: string
  libraryTemplateName?: string | null
  skipCustomTemplatesFeature?: boolean
}

export class MessageTemplateService {
  constructor(
    protected graphClient: MetaGraphClient = createMetaGraphClient(),
    private storage?: ObjectStorage
  ) {}

  async #objectStorage(): Promise<ObjectStorage> {
    if (this.storage) return this.storage
    return app.container.make(ObjectStorage)
  }

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
      parameterSchema: resolveParameterSchema({
        stored: this.#jsonField(row.parameterSchema),
        headerType: row.headerType ?? null,
        headerContent: row.headerContent ?? null,
        bodyText: row.bodyText ?? '',
        buttons: typeof row.buttons === 'string' ? JSON.parse(row.buttons) : (row.buttons ?? null),
      }),
      status: row.status,
      metaTemplateId: row.metaTemplateId ?? null,
      rejectionReason: row.rejectionReason ?? null,
      qualityScore: row.qualityScore ?? null,
      submissionError: row.submissionError ?? null,
      lastSubmittedAt: row.lastSubmittedAt ? new Date(row.lastSubmittedAt).toISOString() : null,
      catalogTemplateId: row.catalogTemplateId ?? null,
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
    organizationId: string
    page?: number
    perPage?: number
    status?: string
    category?: string
    search?: string
    language?: string
  }) {
    const page = params.page ?? 1
    const perPage = params.perPage ?? 20

    let query = db.from('message_templates').where('organizationId', params.organizationId)

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

    if (params.language) {
      query = query.whereRaw("COALESCE(language, '') = COALESCE(?, '')", [params.language])
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
  async getTemplateById(id: string, organizationId: string): Promise<MessageTemplateDto> {
    const row = await db
      .from('message_templates')
      .where('id', id)
      .where('organizationId', organizationId)
      .first()
    if (!row) {
      throw MessageTemplateException.notFound()
    }
    return this.toDto(row)
  }

  /**
   * Apply a Meta message_template_status_update event to a local row.
   * Match by metaTemplateId first, then name + language. Does not insert.
   */
  async applyStatusFromMetaEvent(params: {
    organizationId: string
    metaTemplateId: string
    name: string
    language: string
    event: string
    reason: string | null
    category: string | null
  }): Promise<{ updated: boolean; previousStatus: string | null; nextStatus: string | null }> {
    const language = params.language.replace(/-/g, '_')
    const nextStatus = mapMetaTemplateStatusEvent(params.event)

    let existing = await db
      .from('message_templates')
      .where('organizationId', params.organizationId)
      .where('metaTemplateId', params.metaTemplateId)
      .first()

    if (!existing) {
      existing = await db
        .from('message_templates')
        .where('organizationId', params.organizationId)
        .where('name', params.name)
        .whereRaw("COALESCE(language, '') = COALESCE(?, '')", [language])
        .first()
    }

    if (!existing) {
      logger.info(
        {
          organizationId: params.organizationId,
          metaTemplateId: params.metaTemplateId,
          name: params.name,
          language,
          event: params.event,
        },
        'message_templates.webhook_status_no_local_row'
      )
      return { updated: false, previousStatus: null, nextStatus }
    }

    const previousStatus = String(existing.status ?? '').toLowerCase()
    if (
      previousStatus === nextStatus &&
      String(existing.metaTemplateId ?? '') === params.metaTemplateId
    ) {
      return { updated: false, previousStatus, nextStatus }
    }

    const rejectionReason =
      nextStatus === 'rejected'
        ? (params.reason ?? existing.rejectionReason ?? null)
        : nextStatus === 'approved'
          ? null
          : (existing.rejectionReason ?? null)

    const patch: Record<string, unknown> = {
      status: nextStatus,
      metaTemplateId: params.metaTemplateId,
      rejectionReason,
      updatedAt: new Date(),
    }
    if (params.category) {
      patch.category = params.category.toUpperCase()
    }

    await db.from('message_templates').where('id', existing.id).update(patch)

    await this.#notifyTemplateStatusTransitionBestEffort({
      organizationId: params.organizationId,
      createdByUserId: (existing.createdByUserId as string | null) ?? null,
      templateName: String(existing.name ?? params.name),
      previousStatus,
      nextStatus,
      rejectionReason: typeof rejectionReason === 'string' ? rejectionReason : null,
    })

    return { updated: true, previousStatus, nextStatus }
  }

  /**
   * Sync message templates from Meta WABA account into local database.
   * Uses GET /{waba-id}/message_templates and follows Graph cursor pagination
   * until all pages are consumed (a single page alone can miss templates).
   */
  async syncTemplatesFromMeta(
    organizationId: string
  ): Promise<{ syncedCount: number; orphanedCount: number }> {
    const configRow = await db
      .from('whatsapp_configs')
      .where('organizationId', organizationId)
      .where('status', 'connected')
      .orderBy('connectedAt', 'desc')
      .first()

    if (!configRow || !configRow.wabaId || !configRow.accessToken) {
      throw MessageTemplateException.noActiveWhatsappConfig()
    }

    if (!this.graphClient.listMessageTemplates) {
      return { syncedCount: 0, orphanedCount: 0 }
    }

    const accessToken = decryptWhatsappAccessToken(configRow.accessToken)
    const templates = await this.#listAllMessageTemplatesFromMeta({
      wabaId: configRow.wabaId,
      accessToken,
    })

    const metaIds = new Set<string>()
    for (const metaTpl of templates) {
      if (metaTpl.id) metaIds.add(String(metaTpl.id))
    }

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

    const orphanedCount = await this.#markOrphanLocalTemplates({
      organizationId,
      metaIdsOnWaba: metaIds,
    })

    return { syncedCount: templates.length, orphanedCount }
  }

  /**
   * Local pending/paused rows whose metaTemplateId is missing from a non-empty
   * Meta WABA list are marked rejected. Never wipe on an empty Meta list (token /
   * WABA mismatch), and never demote approved rows — webhooks own that lifecycle.
   */
  async #markOrphanLocalTemplates(params: {
    organizationId: string
    metaIdsOnWaba: Set<string>
  }): Promise<number> {
    if (params.metaIdsOnWaba.size === 0) {
      logger.warn(
        { organizationId: params.organizationId },
        'message_templates.orphan_skip_empty_meta_list'
      )
      return 0
    }

    const locals = await db
      .from('message_templates')
      .where('organizationId', params.organizationId)
      .whereIn('status', ['pending', 'paused'])
      .select('id', 'status', 'metaTemplateId', 'name', 'createdByUserId')

    let orphanedCount = 0
    const orphanMessage =
      'Template is not present on the connected Meta WABA (orphan or never registered).'

    for (const row of locals) {
      const metaId =
        row.metaTemplateId === null || row.metaTemplateId === undefined
          ? ''
          : String(row.metaTemplateId)
      const isOrphan =
        metaId.length > 0 ? !params.metaIdsOnWaba.has(metaId) : String(row.status) === 'pending'

      if (!isOrphan) continue

      const previousStatus = String(row.status ?? '').toLowerCase()
      await db.from('message_templates').where('id', row.id).update({
        status: 'rejected',
        submissionError: orphanMessage,
        updatedAt: new Date(),
      })

      orphanedCount += 1

      await this.#notifyTemplateStatusTransitionBestEffort({
        organizationId: params.organizationId,
        createdByUserId: (row.createdByUserId as string | null) ?? null,
        templateName: String(row.name ?? ''),
        previousStatus,
        nextStatus: 'rejected',
        rejectionReason: orphanMessage,
      })
    }

    if (orphanedCount > 0) {
      logger.info(
        { organizationId: params.organizationId, orphanedCount },
        'message_templates.orphans_marked_rejected'
      )
    }

    return orphanedCount
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
    const skipCustomFeature = Boolean(
      payload.skipCustomTemplatesFeature || payload.catalogTemplateId
    )
    if (!skipCustomFeature) {
      await new PlanEnforcementService().requireFeature(payload.organizationId, 'customTemplates')
    }

    const templateCountRow = await db
      .from('message_templates')
      .where('organizationId', payload.organizationId)
      .count('* as total')
      .first()
    await new PlanEnforcementService().requireUnderLimit(
      payload.organizationId,
      'maxTemplates',
      Number(templateCountRow?.total ?? 0)
    )

    const name = payload.name.toLowerCase().trim()
    const category = payload.category.toUpperCase().trim()
    const language = payload.language.trim()

    if (payload.catalogTemplateId) {
      const alreadyInstalled = await db
        .from('message_templates')
        .where('organizationId', payload.organizationId)
        .where('catalogTemplateId', payload.catalogTemplateId)
        .first()
      if (alreadyInstalled) {
        return this.toDto(alreadyInstalled)
      }
    }

    const existing = await db
      .from('message_templates')
      .where('organizationId', payload.organizationId)
      .where('name', name)
      .whereRaw("COALESCE(language, '') = COALESCE(?, '')", [language])
      .first()

    if (existing) {
      throw MessageTemplateException.duplicateName(name, language)
    }

    const headerType = payload.headerType?.toLowerCase() ?? null
    const headerContent = payload.headerContent ?? null
    const buttons = payload.buttons ?? null
    const parameterSchema = deriveParameterSchema({
      headerType,
      headerContent,
      bodyText: payload.bodyText,
      buttons,
    })

    const configRow = await db
      .from('whatsapp_configs')
      .where('organizationId', payload.organizationId)
      .where('status', 'connected')
      .first()

    let headerMediaUrl = payload.headerMediaUrl?.trim() || null
    let headerHandle: string | null = null
    let mediaUploadError: string | null = null

    const isMediaHeader = headerType === 'image' || headerType === 'document'
    if (isMediaHeader && payload.headerMediaAssetId) {
      const resolved = await this.#resolveHeaderMediaSample({
        organizationId: payload.organizationId,
        headerType,
        mediaAssetId: payload.headerMediaAssetId,
      })
      headerMediaUrl = resolved.deliveryUrl
      if (configRow?.accessToken && this.graphClient.createResumableUploadSession) {
        try {
          const accessToken = decryptWhatsappAccessToken(configRow.accessToken)
          headerHandle = await this.#uploadHeaderSampleToMeta({
            accessToken,
            fileName: resolved.fileName,
            mimeType: resolved.mimeType,
            fileBytes: resolved.fileBytes,
          })
        } catch (err: any) {
          mediaUploadError = err?.message ?? 'Failed to upload header media sample to Meta'
          logger.warn(
            { organizationId: payload.organizationId, err: mediaUploadError },
            'message_templates.header_media_upload_failed'
          )
        }
      }
    } else if (isMediaHeader && payload.headerMediaUrl) {
      headerMediaUrl = payload.headerMediaUrl.trim()
    }

    const metaComponents = this.#buildMetaCreateComponents({
      headerType: payload.headerType,
      headerContent: payload.headerContent,
      bodyText: payload.bodyText,
      footerText: payload.footerText,
      buttons: payload.buttons,
      sampleValues: payload.sampleValues,
      parameterSchema,
      headerHandle,
    })

    let metaTemplateId: string | null = null
    let status = 'pending'
    let submissionError: string | null = mediaUploadError

    if (configRow && configRow.wabaId && configRow.accessToken) {
      try {
        const accessToken = decryptWhatsappAccessToken(configRow.accessToken)
        let created = false

        if (payload.libraryTemplateName && this.graphClient.createMessageTemplateFromLibrary) {
          const metaRes = await this.graphClient.createMessageTemplateFromLibrary({
            wabaId: configRow.wabaId,
            accessToken,
            name,
            category,
            language,
            libraryTemplateName: payload.libraryTemplateName,
            libraryTemplateBodyInputs: this.#libraryBodyInputs({
              parameterSchema,
              sampleValues: payload.sampleValues,
            }),
            libraryTemplateButtonInputs: this.#libraryButtonInputs(buttons),
          })
          metaTemplateId = coerceMetaTemplateId(metaRes.id)
          if (metaRes.status) {
            status = metaRes.status.toLowerCase()
          }
          created = true
        } else if (this.graphClient.createMessageTemplate) {
          const metaRes = await this.graphClient.createMessageTemplate({
            wabaId: configRow.wabaId,
            accessToken,
            name,
            category,
            language,
            components: metaComponents,
            parameterFormat:
              parameterSchema.parameterFormat === 'positional'
                ? 'POSITIONAL'
                : parameterSchema.parameterFormat === 'named'
                  ? 'NAMED'
                  : undefined,
          })
          metaTemplateId = coerceMetaTemplateId(metaRes.id)
          if (metaRes.status) {
            status = metaRes.status.toLowerCase()
          }
          created = true
        }

        if (!created) {
          status = 'rejected'
          submissionError = submissionError
            ? `${submissionError}; Meta template create was not invoked`
            : 'Meta template create was not invoked (Graph client missing create methods)'
          metaTemplateId = null
        } else if (!metaTemplateId) {
          status = 'rejected'
          submissionError = submissionError
            ? `${submissionError}; Meta create returned no template id`
            : 'Meta create returned no template id'
        } else {
          const verified = await this.#verifyCreatedTemplateOnMeta({
            metaTemplateId,
            accessToken,
          })
          if (!verified.ok) {
            // Keep pending when Meta returned an id — GET can lag right after create.
            // Webhooks + Sync own the durable status; do not false-reject here.
            logger.warn(
              {
                organizationId: payload.organizationId,
                metaTemplateId,
                err: verified.error,
              },
              'message_templates.create_verify_deferred'
            )
            submissionError = submissionError
              ? `${submissionError}; ${verified.error}`
              : verified.error
          } else if (verified.status) {
            status = verified.status
          }
        }
      } catch (err: any) {
        const metaError = err.message ?? 'Meta API error'
        submissionError = submissionError ? `${submissionError}; ${metaError}` : metaError
        status = 'rejected'
      }
    } else {
      status = 'draft'
    }

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
        headerMediaUrl,
        bodyText: payload.bodyText,
        footerText: payload.footerText ?? null,
        buttons: buttons ? JSON.stringify(buttons) : null,
        sampleValues: payload.sampleValues ? JSON.stringify(payload.sampleValues) : null,
        parameterSchema: JSON.stringify(parameterSchema),
        status,
        metaTemplateId,
        catalogTemplateId: payload.catalogTemplateId ?? null,
        submissionError,
        lastSubmittedAt: configRow ? new Date() : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*')

    return this.toDto(row)
  }

  /**
   * Confirm Meta create id is a loadable HSM. Prevents orphan pending rows when
   * Graph returns an id that does not exist on the WABA.
   */
  async #verifyCreatedTemplateOnMeta(params: {
    metaTemplateId: string
    accessToken: string
  }): Promise<{ ok: true; status: string | null } | { ok: false; error: string }> {
    if (!this.graphClient.getMessageTemplate) {
      return { ok: true, status: null }
    }

    try {
      const live = await this.graphClient.getMessageTemplate({
        metaTemplateId: params.metaTemplateId,
        accessToken: params.accessToken,
      })
      if (String(live.id) !== params.metaTemplateId) {
        return {
          ok: false,
          error: `Meta create verification mismatch (expected id ${params.metaTemplateId})`,
        }
      }
      return {
        ok: true,
        status: live.status ? live.status.toLowerCase() : null,
      }
    } catch (err: any) {
      return {
        ok: false,
        error:
          err?.message ??
          'Meta create returned a template id that could not be loaded (create verification failed)',
      }
    }
  }

  async #resolveHeaderMediaSample(params: {
    organizationId: string
    headerType: string
    mediaAssetId: string
  }): Promise<{
    deliveryUrl: string
    fileName: string
    mimeType: string
    fileBytes: Uint8Array
  }> {
    const asset = await runWithTenant(params.organizationId, () =>
      db
        .from('media_assets')
        .where('id', params.mediaAssetId)
        .where('organizationId', params.organizationId)
        .where('state', 'ready')
        .select('id', 'fileName', 'mimeType', 'fileSize', 'storageKey', 'deliveryUrl')
        .first()
    )

    if (!asset) {
      throw MessageTemplateException.invalidHeaderMedia('Header media asset not found or not ready')
    }

    const mimeType = String(asset.mimeType || '').toLowerCase()
    if (params.headerType === 'image') {
      if (!['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) {
        throw MessageTemplateException.invalidHeaderMedia(
          'Image header samples must be JPEG or PNG'
        )
      }
    } else if (params.headerType === 'document') {
      if (mimeType !== 'application/pdf') {
        throw MessageTemplateException.invalidHeaderMedia(
          'Document header samples must be PDF for Meta template review'
        )
      }
    }

    const fileSize = Number(asset.fileSize) || 0
    if (fileSize <= 0) {
      throw MessageTemplateException.invalidHeaderMedia('Header media asset has invalid size')
    }

    const storage = await this.#objectStorage()
    const fileBytes = await storage.getObjectPrefix({
      key: asset.storageKey as string,
      maxBytes: fileSize,
    })
    if (!fileBytes || fileBytes.byteLength === 0) {
      throw MessageTemplateException.invalidHeaderMedia('Could not read header media bytes')
    }

    return {
      deliveryUrl: String(asset.deliveryUrl),
      fileName: String(asset.fileName || 'sample'),
      mimeType,
      fileBytes,
    }
  }

  async #uploadHeaderSampleToMeta(params: {
    accessToken: string
    fileName: string
    mimeType: string
    fileBytes: Uint8Array
  }): Promise<string> {
    if (!this.graphClient.createResumableUploadSession || !this.graphClient.uploadResumableFile) {
      throw new Error('Meta resumable upload is not available on this client')
    }

    const session = await this.graphClient.createResumableUploadSession({
      accessToken: params.accessToken,
      fileLength: params.fileBytes.byteLength,
      fileType: params.mimeType === 'image/jpg' ? 'image/jpeg' : params.mimeType,
      fileName: params.fileName,
    })

    const uploaded = await this.graphClient.uploadResumableFile({
      accessToken: params.accessToken,
      uploadSessionId: session.uploadSessionId,
      fileBytes: params.fileBytes,
    })

    return uploaded.handle
  }

  #sampleValueMap(sampleValues: unknown): Record<string, string> {
    if (!sampleValues || typeof sampleValues !== 'object' || Array.isArray(sampleValues)) {
      return {}
    }
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(sampleValues as Record<string, unknown>)) {
      if (value === null || value === undefined) continue
      const text = String(value).trim()
      if (text) out[key] = text
    }
    return out
  }

  #buildMetaCreateComponents(params: {
    headerType?: string
    headerContent?: string
    bodyText: string
    footerText?: string
    buttons?: Array<Record<string, unknown>>
    sampleValues?: unknown
    parameterSchema: TemplateParameterSchema
    headerHandle: string | null
  }): MetaTemplateComponent[] {
    const samples = this.#sampleValueMap(params.sampleValues)
    const metaComponents: MetaTemplateComponent[] = []

    if (params.headerType && params.headerType.toUpperCase() !== 'NONE') {
      const format = params.headerType.toUpperCase()
      if (format === 'TEXT' && params.headerContent) {
        const headerExampleValues = params.parameterSchema.headerNames.map(
          (name) => samples[name] ?? ''
        )
        const hasCompleteHeaderExamples =
          params.parameterSchema.headerNames.length === 0 ||
          headerExampleValues.every((value) => value.trim().length > 0)
        metaComponents.push({
          type: 'HEADER',
          format: 'TEXT',
          text: params.headerContent,
          ...(hasCompleteHeaderExamples && headerExampleValues.length > 0
            ? { example: { header_text: headerExampleValues } }
            : {}),
        })
      } else if (format === 'IMAGE' || format === 'DOCUMENT') {
        metaComponents.push({
          type: 'HEADER',
          format,
          ...(params.headerHandle ? { example: { header_handle: [params.headerHandle] } } : {}),
        })
      }
    }

    const bodyExampleValues = params.parameterSchema.bodyNames.map((name) => samples[name] ?? '')
    const hasCompleteBodyExamples =
      params.parameterSchema.bodyNames.length === 0 ||
      bodyExampleValues.every((value) => value.trim().length > 0)

    metaComponents.push({
      type: 'BODY',
      text: params.bodyText,
      ...(hasCompleteBodyExamples && bodyExampleValues.length > 0
        ? { example: { body_text: [bodyExampleValues] } }
        : {}),
    })

    if (params.footerText) {
      metaComponents.push({
        type: 'FOOTER',
        text: params.footerText,
      })
    }

    if (params.buttons && params.buttons.length > 0) {
      metaComponents.push({
        type: 'BUTTONS',
        buttons: this.#metaCreateButtons(params.buttons, samples),
      })
    }

    return metaComponents
  }

  #libraryBodyInputs(params: {
    parameterSchema: TemplateParameterSchema
    sampleValues?: unknown
  }): Record<string, unknown> | undefined {
    const samples = this.#sampleValueMap(params.sampleValues)
    const names = params.parameterSchema.bodyNames
    if (names.length === 0) return undefined

    if (params.parameterSchema.parameterFormat === 'named') {
      const named: Record<string, string> = {}
      for (const name of names) {
        const value = samples[name]
        if (value) named[name] = value
      }
      return Object.keys(named).length > 0 ? named : undefined
    }

    const positional = names
      .map((name) => samples[name])
      .filter((value): value is string => Boolean(value))
    return positional.length > 0 ? { body_text: positional } : undefined
  }

  #libraryButtonInputs(
    buttons: Array<Record<string, unknown>> | null | undefined
  ): unknown[] | undefined {
    if (!buttons || buttons.length === 0) return undefined
    const inputs: unknown[] = []
    for (const button of buttons) {
      const type = String(button.type ?? '').toUpperCase()
      if (type === 'URL' && button.url) {
        inputs.push({
          type: 'URL',
          url: String(button.url),
          ...(Array.isArray(button.example) ? { example: button.example } : {}),
        })
      } else if (type === 'PHONE_NUMBER' && (button.phone_number || button.phoneNumber)) {
        inputs.push({
          type: 'PHONE_NUMBER',
          phone_number: String(button.phone_number ?? button.phoneNumber),
        })
      }
    }
    return inputs.length > 0 ? inputs : undefined
  }

  #metaCreateButtons(
    buttons: Array<Record<string, unknown>>,
    samples: Record<string, string>
  ): Array<Record<string, unknown>> {
    return buttons.map((button) => {
      const type = String(button.type ?? '').toUpperCase()
      if (type !== 'URL') return button

      const url = String(button.url ?? '')
      const vars = url.match(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*\}\}/g)
      if (!vars || vars.length === 0) return button
      if (Array.isArray(button.example) && button.example.length > 0) return button

      const examples: string[] = []
      for (const raw of vars) {
        const key = raw.replace(/\{\{\s*|\s*\}\}/g, '')
        const sample = samples[key]
        if (sample) examples.push(sample)
      }
      if (examples.length !== vars.length) return button
      return { ...button, example: examples }
    })
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

/** Meta create responses sometimes return numeric ids in JSON. */
export function coerceMetaTemplateId(id: unknown): string | null {
  if (typeof id === 'string') {
    const trimmed = id.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof id === 'number' && Number.isFinite(id)) {
    return String(id)
  }
  return null
}

/**
 * Map Meta message_template_status_update event values to local status strings.
 */
export function mapMetaTemplateStatusEvent(event: string): string {
  const normalized = event.trim().toUpperCase()
  switch (normalized) {
    case 'APPROVED':
    case 'REINSTATED':
    case 'UNARCHIVED':
    case 'FLAGGED':
      return 'approved'
    case 'REJECTED':
      return 'rejected'
    case 'PENDING':
    case 'IN_APPEAL':
      return 'pending'
    case 'PAUSED':
      return 'paused'
    case 'DISABLED':
      return 'disabled'
    case 'DELETED':
    case 'PENDING_DELETION':
    case 'ARCHIVED':
      return 'deleted'
    default:
      return normalized.toLowerCase()
  }
}
