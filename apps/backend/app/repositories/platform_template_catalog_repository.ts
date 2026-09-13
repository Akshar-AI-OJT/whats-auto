import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

type DbClient = typeof db | TransactionClientContract

export type PlatformTemplateCatalogRow = {
  id: string
  slug: string
  name: string
  category: string
  language: string
  headerType: string | null
  headerContent: string | null
  bodyText: string
  footerText: string | null
  buttons: unknown
  sampleValues: unknown
  parameterSchema: unknown
  libraryTemplateName: string | null
  libraryTopic: string | null
  libraryUsecase: string | null
  libraryIndustry: string | null
  source: string
  status: string
  sortOrder: number
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type PlatformTemplateCatalogListFilters = {
  page?: number
  perPage?: number
  search?: string
  category?: string
  language?: string
  industry?: string
  topic?: string
  status?: string
  source?: string
  publishedOnly?: boolean
}

export type InsertPlatformTemplateCatalogParams = {
  slug: string
  name: string
  category: string
  language: string
  headerType?: string | null
  headerContent?: string | null
  bodyText: string
  footerText?: string | null
  buttons?: unknown
  sampleValues?: unknown
  parameterSchema?: unknown
  libraryTemplateName?: string | null
  libraryTopic?: string | null
  libraryUsecase?: string | null
  libraryIndustry?: string | null
  source: string
  status: string
  sortOrder?: number
  createdByUserId?: string | null
}

export class PlatformTemplateCatalogRepository {
  async findById(id: string, client: DbClient = db): Promise<PlatformTemplateCatalogRow | null> {
    return (await client.from('platform_template_catalog').where('id', id).first()) ?? null
  }

  async findByLibraryNameLanguage(
    libraryTemplateName: string,
    language: string,
    client: DbClient = db
  ): Promise<PlatformTemplateCatalogRow | null> {
    return (
      (await client
        .from('platform_template_catalog')
        .where('libraryTemplateName', libraryTemplateName)
        .where('language', language)
        .first()) ?? null
    )
  }

  async findBySlug(
    slug: string,
    client: DbClient = db
  ): Promise<PlatformTemplateCatalogRow | null> {
    return (await client.from('platform_template_catalog').where('slug', slug).first()) ?? null
  }

  async listPublishedIds(client: DbClient = db): Promise<Set<string>> {
    const rows = await client
      .from('platform_template_catalog')
      .where('status', 'PUBLISHED')
      .select('id')
    return new Set((rows as Array<{ id: string }>).map((row) => row.id))
  }

  async list(filters: PlatformTemplateCatalogListFilters, client: DbClient = db) {
    const page = filters.page ?? 1
    const perPage = filters.perPage ?? 20

    let query = client.from('platform_template_catalog')

    if (filters.publishedOnly) {
      query = query.where('status', 'PUBLISHED')
    } else if (filters.status) {
      query = query.where('status', filters.status)
    }

    if (filters.category) {
      query = query.where('category', filters.category.toUpperCase())
    }
    if (filters.language) {
      query = query.whereRaw("COALESCE(language, '') = COALESCE(?, '')", [filters.language])
    }
    if (filters.industry) {
      query = query.where('libraryIndustry', filters.industry)
    }
    if (filters.topic) {
      query = query.where('libraryTopic', filters.topic)
    }
    if (filters.source) {
      query = query.where('source', filters.source)
    }
    if (filters.search) {
      const term = `%${filters.search}%`
      query = query.where((q) => {
        q.whereILike('name', term).orWhereILike('bodyText', term).orWhereILike('slug', term)
      })
    }

    const countResult = await query.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)

    const rows = (await query
      .orderBy('sortOrder', 'asc')
      .orderBy('name', 'asc')
      .offset((page - 1) * perPage)
      .limit(perPage)) as PlatformTemplateCatalogRow[]

    return {
      rows,
      total,
      page,
      perPage,
      lastPage: Math.ceil(total / perPage) || 1,
    }
  }

  async insert(
    params: InsertPlatformTemplateCatalogParams,
    client: DbClient = db
  ): Promise<PlatformTemplateCatalogRow> {
    const [row] = await client
      .table('platform_template_catalog')
      .insert({
        slug: params.slug,
        name: params.name,
        category: params.category,
        language: params.language,
        headerType: params.headerType ?? null,
        headerContent: params.headerContent ?? null,
        bodyText: params.bodyText,
        footerText: params.footerText ?? null,
        buttons: params.buttons ? JSON.stringify(params.buttons) : null,
        sampleValues: params.sampleValues ? JSON.stringify(params.sampleValues) : null,
        parameterSchema: params.parameterSchema ? JSON.stringify(params.parameterSchema) : null,
        libraryTemplateName: params.libraryTemplateName ?? null,
        libraryTopic: params.libraryTopic ?? null,
        libraryUsecase: params.libraryUsecase ?? null,
        libraryIndustry: params.libraryIndustry ?? null,
        source: params.source,
        status: params.status,
        sortOrder: params.sortOrder ?? 0,
        createdByUserId: params.createdByUserId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*')

    return row as PlatformTemplateCatalogRow
  }

  async update(
    id: string,
    patch: Record<string, unknown>,
    client: DbClient = db
  ): Promise<PlatformTemplateCatalogRow | null> {
    const payload: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    for (const key of ['buttons', 'sampleValues', 'parameterSchema'] as const) {
      if (key in payload && payload[key] !== null && typeof payload[key] !== 'string') {
        payload[key] = JSON.stringify(payload[key])
      }
    }
    const [row] = await client
      .from('platform_template_catalog')
      .where('id', id)
      .update(payload)
      .returning('*')
    return (row as PlatformTemplateCatalogRow) ?? null
  }
}
