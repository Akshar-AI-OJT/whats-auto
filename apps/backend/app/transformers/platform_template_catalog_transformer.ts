import { CatalogStatus } from '#enums/catalog_status'
import { CatalogTemplateSource } from '#enums/catalog_template_source'
import type { PlatformTemplateCatalogRow } from '#repositories/platform_template_catalog_repository'

export type PlatformTemplateCatalogResponse = {
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
  createdAt: string
  updatedAt: string | null
}

function parseJson(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value ?? null
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function transformPlatformTemplateCatalog(
  row: PlatformTemplateCatalogRow
): PlatformTemplateCatalogResponse {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    language: row.language,
    headerType: row.headerType,
    headerContent: row.headerContent,
    bodyText: row.bodyText,
    footerText: row.footerText,
    buttons: parseJson(row.buttons),
    sampleValues: parseJson(row.sampleValues),
    parameterSchema: parseJson(row.parameterSchema),
    libraryTemplateName: row.libraryTemplateName,
    libraryTopic: row.libraryTopic,
    libraryUsecase: row.libraryUsecase,
    libraryIndustry: row.libraryIndustry,
    source: row.source,
    status: row.status,
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt),
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
  }
}

export { CatalogStatus, CatalogTemplateSource }
