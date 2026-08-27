import vine from '@vinejs/vine'

export const ORGANIZATION_TYPES = [
  'company',
  'partnership',
  'sole_proprietorship',
  'other',
] as const

/** Indian PAN: 5 letters, 4 digits, 1 letter. */
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

/** Indian GSTIN: 15 chars (state + PAN + entity + Z + check). */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

const organizationTypeSchema = vine.enum([...ORGANIZATION_TYPES])
const addressSchema = vine.string().trim().minLength(8).maxLength(500)
const panSchema = vine.string().trim().toUpperCase().regex(PAN_REGEX)
const gstinSchema = vine.string().trim().toUpperCase().regex(GSTIN_REGEX)
const phoneSchema = vine
  .string()
  .trim()
  .minLength(7)
  .maxLength(30)
  .regex(/^\+?[0-9\s\-().]+$/)

export const createOrganizationValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(200),
    slug: vine
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .minLength(2)
      .maxLength(100),
    email: vine.string().trim().email(),
    phone: phoneSchema,
    website: vine.string().trim().url().optional(),
    industry: vine.string().trim().optional(),
    organizationType: organizationTypeSchema,
    address: addressSchema,
    pan: panSchema.optional(),
    gstin: gstinSchema.optional(),
    country: vine.string().trim().minLength(2).maxLength(100),
    timezone: vine.string().trim().minLength(1).maxLength(100),
    currency: vine.string().trim().maxLength(10).optional(),
  })
)

export const updateOrganizationValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(200).optional(),
    phone: phoneSchema.optional(),
    website: vine.string().trim().url().optional(),
    industry: vine.string().trim().optional(),
    organizationType: organizationTypeSchema.optional(),
    address: addressSchema.optional(),
    pan: panSchema.optional(),
    gstin: gstinSchema.optional(),
    timezone: vine.string().trim().minLength(1).maxLength(100).optional(),
    currency: vine.string().trim().maxLength(10).optional(),
  })
)

export const listSuperAdminOrganizationsValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)

export const organizationIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)
