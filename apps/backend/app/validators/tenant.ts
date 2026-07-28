import vine from '@vinejs/vine'

const slugRule = () =>
  vine
    .string()
    .trim()
    .toLowerCase()
    .minLength(2)
    .maxLength(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/** JSON object only (not array / scalar). */
const metadataRule = () => vine.record(vine.any()).optional()

export const tenantIdValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const createTenantValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(100),
    slug: slugRule().optional(),
    logo: vine.string().trim().url().optional(),
    metadata: metadataRule(),
  })
)

export const updateTenantValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(100).optional(),
    slug: slugRule().optional(),
    logo: vine.string().trim().url().nullable().optional(),
    metadata: metadataRule(),
  })
)
