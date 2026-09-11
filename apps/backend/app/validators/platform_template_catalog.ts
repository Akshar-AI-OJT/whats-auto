import vine from '@vinejs/vine'
import { CATALOG_STATUSES } from '#enums/catalog_status'
import { CATALOG_TEMPLATE_SOURCES } from '#enums/catalog_template_source'
import { TEMPLATE_CATEGORIES, TEMPLATE_HEADER_TYPES } from '#validators/message_template'

const catalogIdParam = vine.object({
  id: vine.string().trim().uuid(),
})

export const catalogIdParamValidator = vine.create(catalogIdParam)

export const listPlatformTemplateCatalogValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    search: vine.string().trim().maxLength(255).optional(),
    category: vine.string().trim().optional(),
    language: vine.string().trim().minLength(2).maxLength(10).optional(),
    industry: vine.string().trim().maxLength(80).optional(),
    topic: vine.string().trim().maxLength(80).optional(),
    status: vine.enum(CATALOG_STATUSES).optional(),
    source: vine.enum(CATALOG_TEMPLATE_SOURCES).optional(),
  })
)

export const listOrgTemplateCatalogValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    search: vine.string().trim().maxLength(255).optional(),
    category: vine.string().trim().optional(),
    language: vine.string().trim().minLength(2).maxLength(10).optional(),
    industry: vine.string().trim().maxLength(80).optional(),
    topic: vine.string().trim().maxLength(80).optional(),
  })
)

export const listMetaTemplateLibraryValidator = vine.create(
  vine.object({
    search: vine.string().trim().maxLength(255).optional(),
    topic: vine.string().trim().maxLength(80).optional(),
    usecase: vine.string().trim().maxLength(80).optional(),
    industry: vine.string().trim().maxLength(80).optional(),
    language: vine.string().trim().minLength(2).maxLength(10).optional(),
    name: vine.string().trim().maxLength(255).optional(),
    category: vine.string().trim().optional(),
    after: vine.string().trim().optional(),
  })
)

export const importTemplateCatalogValidator = vine.create(
  vine.object({
    items: vine.array(vine.record(vine.any())).minLength(1).maxLength(100),
  })
)

export const createPlatformTemplateCatalogValidator = vine.create(
  vine.object({
    name: vine
      .string()
      .trim()
      .regex(/^[a-z0-9_]+$/)
      .minLength(1)
      .maxLength(512),
    category: vine
      .string()
      .trim()
      .toUpperCase()
      .in([...TEMPLATE_CATEGORIES]),
    language: vine.string().trim().minLength(2).maxLength(10),
    headerType: vine
      .string()
      .trim()
      .toUpperCase()
      .in([...TEMPLATE_HEADER_TYPES])
      .optional(),
    headerContent: vine.string().trim().maxLength(60).optional(),
    bodyText: vine.string().trim().minLength(1).maxLength(1024),
    footerText: vine.string().trim().maxLength(60).optional(),
    buttons: vine.array(vine.any()).optional(),
    sampleValues: vine.any().optional(),
    slug: vine.string().trim().maxLength(80).optional(),
  })
)

export const updatePlatformTemplateCatalogValidator = vine.create(
  vine.object({
    name: vine
      .string()
      .trim()
      .regex(/^[a-z0-9_]+$/)
      .minLength(1)
      .maxLength(512)
      .optional(),
    category: vine
      .string()
      .trim()
      .toUpperCase()
      .in([...TEMPLATE_CATEGORIES])
      .optional(),
    language: vine.string().trim().minLength(2).maxLength(10).optional(),
    headerType: vine
      .string()
      .trim()
      .toUpperCase()
      .in([...TEMPLATE_HEADER_TYPES])
      .optional(),
    headerContent: vine.string().trim().maxLength(60).nullable().optional(),
    bodyText: vine.string().trim().minLength(1).maxLength(1024).optional(),
    footerText: vine.string().trim().maxLength(60).nullable().optional(),
    buttons: vine.array(vine.any()).optional(),
    sampleValues: vine.any().optional(),
    sortOrder: vine.number().withoutDecimals().optional(),
  })
)
