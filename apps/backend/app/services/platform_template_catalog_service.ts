import env from '#start/env'
import { CatalogStatus } from '#enums/catalog_status'
import { CatalogTemplateSource } from '#enums/catalog_template_source'
import PlatformCatalogException from '#exceptions/platform_catalog_exception'
import { createMetaGraphClient, type MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { deriveParameterSchema } from '#lib/meta_whatsapp/template_parameters'
import type { MetaTemplateLibraryItem } from '#lib/meta_whatsapp/types'
import {
  PlatformTemplateCatalogRepository,
  type PlatformTemplateCatalogRow,
} from '#repositories/platform_template_catalog_repository'
import { MessageTemplateService } from '#services/message_template_service'
import { runWithTenant } from '#services/tenant_context'
import {
  transformPlatformTemplateCatalog,
  type PlatformTemplateCatalogResponse,
} from '#transformers/platform_template_catalog_transformer'

export type CatalogListParams = {
  page?: number
  perPage?: number
  search?: string
  category?: string
  language?: string
  industry?: string
  topic?: string
  status?: string
  source?: string
}

export type ManualCatalogCreateInput = {
  name: string
  category: string
  language: string
  headerType?: string
  headerContent?: string
  bodyText: string
  footerText?: string
  buttons?: Array<Record<string, unknown>>
  sampleValues?: unknown
  slug?: string
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return slug || 'template'
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function jsonField(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value ?? null
}

export class PlatformTemplateCatalogService {
  constructor(
    private catalog: PlatformTemplateCatalogRepository = new PlatformTemplateCatalogRepository(),
    private templates: MessageTemplateService = new MessageTemplateService(),
    protected graphClient: MetaGraphClient = createMetaGraphClient()
  ) {}

  #systemUserToken(): string | undefined {
    return env.get('META_SYSTEM_USER_ACCESS_TOKEN')
  }

  async listLibrary(params: {
    search?: string
    topic?: string
    usecase?: string
    industry?: string
    language?: string
    name?: string
    category?: string
    after?: string
  }) {
    const token = this.#systemUserToken()
    if (!token) {
      throw PlatformCatalogException.libraryTokenMissing()
    }
    if (!this.graphClient.listMessageTemplateLibrary) {
      throw PlatformCatalogException.libraryTokenMissing()
    }
    return this.graphClient.listMessageTemplateLibrary({
      accessToken: token,
      search: params.search,
      topic: params.topic,
      usecase: params.usecase,
      industry: params.industry,
      language: params.language,
      name: params.name,
      category: params.category,
      after: params.after,
    })
  }

  async list(params: CatalogListParams & { publishedOnly?: boolean }) {
    const result = await this.catalog.list(params)
    return {
      data: result.rows.map(transformPlatformTemplateCatalog),
      meta: {
        total: result.total,
        perPage: result.perPage,
        currentPage: result.page,
        lastPage: result.lastPage,
      },
    }
  }

  async getById(id: string, publishedOnly = false): Promise<PlatformTemplateCatalogResponse> {
    const row = await this.catalog.findById(id)
    if (!row || (publishedOnly && row.status !== CatalogStatus.PUBLISHED)) {
      throw PlatformCatalogException.templateNotFound()
    }
    return transformPlatformTemplateCatalog(row)
  }

  async createManual(
    payload: ManualCatalogCreateInput,
    actorUserId: string
  ): Promise<PlatformTemplateCatalogResponse> {
    const name = payload.name.toLowerCase().trim()
    const category = payload.category.toUpperCase().trim()
    const language = payload.language.trim()
    let slug = slugify(payload.slug?.trim() || name)
    if (await this.catalog.findBySlug(slug)) {
      slug = `${slug}_${Date.now().toString(36)}`
    }

    const headerType = payload.headerType?.toLowerCase() ?? 'none'
    const parameterSchema = deriveParameterSchema({
      headerType,
      headerContent: payload.headerContent ?? null,
      bodyText: payload.bodyText,
      buttons: payload.buttons,
    })

    const row = await this.catalog.insert({
      slug,
      name,
      category,
      language,
      headerType,
      headerContent: payload.headerContent ?? null,
      bodyText: payload.bodyText,
      footerText: payload.footerText ?? null,
      buttons: payload.buttons ?? null,
      sampleValues: payload.sampleValues ?? null,
      parameterSchema,
      source: CatalogTemplateSource.MANUAL,
      status: CatalogStatus.DRAFT,
      createdByUserId: actorUserId,
    })
    return transformPlatformTemplateCatalog(row)
  }

  async update(
    id: string,
    patch: Partial<ManualCatalogCreateInput> & { sortOrder?: number },
    actorUserId: string
  ): Promise<PlatformTemplateCatalogResponse> {
    const existing = await this.requireRow(id)
    if (existing.status === CatalogStatus.ARCHIVED) {
      throw PlatformCatalogException.archived()
    }

    const headerType = patch.headerType?.toLowerCase() ?? existing.headerType
    const headerContent =
      patch.headerContent !== undefined ? patch.headerContent : existing.headerContent
    const bodyText = patch.bodyText ?? existing.bodyText
    const buttons = patch.buttons !== undefined ? patch.buttons : jsonField(existing.buttons)
    const parameterSchema = deriveParameterSchema({
      headerType,
      headerContent,
      bodyText,
      buttons,
    })

    const row = await this.catalog.update(id, {
      ...(patch.name ? { name: patch.name.toLowerCase().trim() } : {}),
      ...(patch.category ? { category: patch.category.toUpperCase().trim() } : {}),
      ...(patch.language ? { language: patch.language.trim() } : {}),
      ...(patch.headerType !== undefined ? { headerType } : {}),
      ...(patch.headerContent !== undefined ? { headerContent: patch.headerContent ?? null } : {}),
      ...(patch.bodyText !== undefined ? { bodyText: patch.bodyText } : {}),
      ...(patch.footerText !== undefined ? { footerText: patch.footerText ?? null } : {}),
      ...(patch.buttons !== undefined ? { buttons: patch.buttons ?? null } : {}),
      ...(patch.sampleValues !== undefined ? { sampleValues: patch.sampleValues ?? null } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      parameterSchema,
      updatedByUserId: actorUserId,
    })
    if (!row) throw PlatformCatalogException.templateNotFound()
    return transformPlatformTemplateCatalog(row)
  }

  async publish(id: string, actorUserId: string): Promise<PlatformTemplateCatalogResponse> {
    const existing = await this.requireRow(id)
    if (!existing.bodyText.trim() || !existing.name.trim()) {
      throw PlatformCatalogException.incomplete()
    }
    const row = await this.catalog.update(id, {
      status: CatalogStatus.PUBLISHED,
      updatedByUserId: actorUserId,
    })
    if (!row) throw PlatformCatalogException.templateNotFound()
    return transformPlatformTemplateCatalog(row)
  }

  async archive(id: string, actorUserId: string): Promise<PlatformTemplateCatalogResponse> {
    const row = await this.catalog.update(id, {
      status: CatalogStatus.ARCHIVED,
      updatedByUserId: actorUserId,
    })
    if (!row) throw PlatformCatalogException.templateNotFound()
    return transformPlatformTemplateCatalog(row)
  }

  async importLibraryItems(
    items: MetaTemplateLibraryItem[],
    actorUserId: string
  ): Promise<{
    imported: PlatformTemplateCatalogResponse[]
    skipped: Array<{ name: string; reason: string }>
  }> {
    const imported: PlatformTemplateCatalogResponse[] = []
    const skipped: Array<{ name: string; reason: string }> = []

    for (const item of items) {
      const mapped = this.#mapLibraryItem(item)
      if (!mapped) {
        skipped.push({
          name: asText(item.name) || 'unknown',
          reason: 'Missing name, language, category, or body',
        })
        continue
      }

      const existing = await this.catalog.findByLibraryNameLanguage(
        mapped.libraryTemplateName,
        mapped.language
      )
      if (existing) {
        imported.push(transformPlatformTemplateCatalog(existing))
        continue
      }

      let slug = slugify(`${mapped.libraryTemplateName}_${mapped.language}`)
      if (await this.catalog.findBySlug(slug)) {
        slug = `${slug}_${Date.now().toString(36)}`
      }

      const row = await this.catalog.insert({
        ...mapped,
        slug,
        createdByUserId: actorUserId,
      })
      imported.push(transformPlatformTemplateCatalog(row))
    }

    return { imported, skipped }
  }

  async installForOrganization(params: {
    catalogId: string
    organizationId: string
    userId?: string
  }) {
    const catalog = await this.requireRow(params.catalogId)
    if (catalog.status !== CatalogStatus.PUBLISHED) {
      throw PlatformCatalogException.templateNotFound()
    }

    return runWithTenant(params.organizationId, () =>
      this.templates.createTemplate({
        organizationId: params.organizationId,
        userId: params.userId,
        name: catalog.name,
        category: catalog.category,
        language: catalog.language,
        headerType: catalog.headerType ?? undefined,
        headerContent: catalog.headerContent ?? undefined,
        bodyText: catalog.bodyText,
        footerText: catalog.footerText ?? undefined,
        buttons: jsonField(catalog.buttons) as Array<Record<string, unknown>> | undefined,
        sampleValues: jsonField(catalog.sampleValues),
        catalogTemplateId: catalog.id,
        libraryTemplateName: catalog.libraryTemplateName,
        skipCustomTemplatesFeature: true,
      })
    )
  }

  async requireRow(id: string): Promise<PlatformTemplateCatalogRow> {
    const row = await this.catalog.findById(id)
    if (!row) throw PlatformCatalogException.templateNotFound()
    return row
  }

  #mapLibraryItem(item: MetaTemplateLibraryItem): {
    name: string
    category: string
    language: string
    headerType: string | null
    headerContent: string | null
    bodyText: string
    footerText: string | null
    buttons: unknown
    libraryTemplateName: string
    libraryTopic: string | null
    libraryUsecase: string | null
    libraryIndustry: string | null
    source: string
    status: string
    parameterSchema: unknown
  } | null {
    const components = Array.isArray(item.components) ? item.components : []
    const headerComp = components.find((c) => String(c.type).toUpperCase() === 'HEADER')
    const bodyComp = components.find((c) => String(c.type).toUpperCase() === 'BODY')
    const footerComp = components.find((c) => String(c.type).toUpperCase() === 'FOOTER')
    const buttonsComp = components.find((c) => String(c.type).toUpperCase() === 'BUTTONS')

    const libraryTemplateName = asText(item.name)
    const language = asText(item.language) || 'en_US'
    const category = (asText(item.category) || 'UTILITY').toUpperCase()
    const bodyText = asText(item.body) || asText(bodyComp?.text)
    if (!libraryTemplateName || !bodyText || !category) return null

    const headerFormat = asText(headerComp?.format).toLowerCase()
    const headerText = asText(item.header) || asText(headerComp?.text)
    let headerType: string | null = null
    let headerContent: string | null = null
    if (headerFormat === 'image' || headerFormat === 'document' || headerFormat === 'video') {
      headerType = headerFormat
    } else if (headerText) {
      headerType = 'text'
      headerContent = headerText
    } else {
      headerType = 'none'
    }

    const buttons = item.buttons ?? buttonsComp?.buttons ?? null
    const needsOrgInputs = this.#buttonsNeedOrgInputs(buttons)
    const needsMedia = headerType === 'image' || headerType === 'document' || headerType === 'video'
    const status = needsOrgInputs || needsMedia ? CatalogStatus.DRAFT : CatalogStatus.PUBLISHED

    const parameterSchema = deriveParameterSchema({
      headerType,
      headerContent,
      bodyText,
      buttons,
    })

    return {
      name: libraryTemplateName.toLowerCase(),
      category,
      language,
      headerType,
      headerContent,
      bodyText,
      footerText: asText(item.footer) || asText(footerComp?.text) || null,
      buttons,
      libraryTemplateName,
      libraryTopic: asText(item.topic) || null,
      libraryUsecase: asText(item.usecase) || null,
      libraryIndustry: asText(item.industry) || null,
      source: CatalogTemplateSource.META_LIBRARY,
      status,
      parameterSchema,
    }
  }

  #buttonsNeedOrgInputs(buttons: unknown): boolean {
    if (!Array.isArray(buttons)) return false
    return buttons.some((button) => {
      if (!button || typeof button !== 'object') return false
      const type = String((button as Record<string, unknown>).type ?? '').toUpperCase()
      if (type === 'URL' || type === 'PHONE_NUMBER') return true
      return false
    })
  }
}
