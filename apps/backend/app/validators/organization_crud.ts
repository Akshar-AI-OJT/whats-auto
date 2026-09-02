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
const panSchema = vine.string().trim().toUpperCase().regex(PAN_REGEX)
const gstinSchema = vine.string().trim().toUpperCase().regex(GSTIN_REGEX)

/** PATCH: omit, null, empty string (clear), or valid tax id. Create keeps strict optional pan/gstin. */
const optionalPanUpdateSchema = vine
  .unionOfTypes([vine.literal(null), vine.literal(''), panSchema])
  .optional()
const optionalGstinUpdateSchema = vine
  .unionOfTypes([vine.literal(null), vine.literal(''), gstinSchema])
  .optional()
const phoneSchema = vine
  .string()
  .trim()
  .minLength(7)
  .maxLength(30)
  .regex(/^\+?[0-9\s\-().]+$/)

/** Structured address preferred for profile completion (country is organizations.country). */
export const organizationAddressObjectSchema = vine.object({
  addressLine1: vine.string().trim().minLength(1).maxLength(200),
  addressLine2: vine.string().trim().maxLength(200).nullable().optional(),
  city: vine.string().trim().minLength(1).maxLength(100),
  state: vine.string().trim().minLength(1).maxLength(100),
  postalCode: vine.string().trim().minLength(1).maxLength(32),
})

/**
 * Accept structured address or legacy free-text string (create/onboarding compat).
 * Service layer normalizes strings into the jsonb object shape.
 */
const addressInputSchema = vine.union([
  vine.union.if(
    (value) => typeof value === 'string',
    vine.string().trim().minLength(8).maxLength(500)
  ),
  vine.union.else(organizationAddressObjectSchema),
])

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
    address: addressInputSchema,
    pan: panSchema.optional(),
    gstin: gstinSchema.optional(),
    country: vine.string().trim().minLength(2).maxLength(100),
    timezone: vine.string().trim().minLength(1).maxLength(100),
    currency: vine.string().trim().maxLength(10).optional(),
    description: vine.string().trim().maxLength(2000).optional(),
    businessSize: vine.string().trim().maxLength(64).optional(),
    alternatePhone: phoneSchema.optional(),
    defaultLanguage: vine.string().trim().minLength(2).maxLength(16).optional(),
    businessRegistrationNumber: vine.string().trim().maxLength(64).optional(),
    designation: vine.string().trim().minLength(1).maxLength(120).optional(),
  })
)

export const updateOrganizationValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(200).optional(),
    phone: phoneSchema.optional(),
    website: vine.string().trim().url().optional(),
    industry: vine.string().trim().optional(),
    organizationType: organizationTypeSchema.optional(),
    address: addressInputSchema.optional(),
    pan: optionalPanUpdateSchema,
    gstin: optionalGstinUpdateSchema,
    country: vine.string().trim().minLength(2).maxLength(100).optional(),
    timezone: vine.string().trim().minLength(1).maxLength(100).optional(),
    currency: vine.string().trim().maxLength(10).optional(),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
    businessSize: vine.string().trim().maxLength(64).nullable().optional(),
    alternatePhone: phoneSchema.nullable().optional(),
    defaultLanguage: vine.string().trim().minLength(2).maxLength(16).nullable().optional(),
    businessRegistrationNumber: vine.string().trim().maxLength(64).nullable().optional(),
    /** Optional title for the caller's membership (owner/admin profile completion). */
    designation: vine.string().trim().minLength(1).maxLength(120).nullable().optional(),
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
