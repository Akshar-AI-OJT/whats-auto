import vine, { errors } from '@vinejs/vine'

function contactProfileFieldRules() {
  return {
    name: vine.string().trim().minLength(1).maxLength(255).optional(),
    email: vine.string().trim().email().maxLength(255).optional(),
    company: vine.string().trim().minLength(1).maxLength(255).optional(),
  }
}

export const createContactValidator = vine.create(
  vine.object({
    phoneNumber: vine.string().trim().minLength(1).maxLength(32),
    countryCode: vine
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    ...contactProfileFieldRules(),
  })
)

export const contactProfileFieldsValidator = vine.create(vine.object(contactProfileFieldRules()))

export type ContactProfileFields = {
  name?: string
  email?: string
  company?: string
}

type VineFieldError = {
  field?: string
  rule?: string
  message?: string
}

function profileValidationMessage(messages: VineFieldError[]): string {
  const first = messages.find((item) => item.message) ?? messages[0]
  const field = first?.field
  const rule = first?.rule

  if (field === 'email' && (rule === 'email' || rule === 'regex')) {
    return 'Invalid email address'
  }
  if (field === 'name' && (rule === 'maxLength' || rule === 'max')) {
    return 'Name is too long'
  }
  if (field === 'email' && (rule === 'maxLength' || rule === 'max')) {
    return 'Email is too long'
  }
  if (field === 'company' && (rule === 'maxLength' || rule === 'max')) {
    return 'Company is too long'
  }
  if (field === 'email') return 'Invalid email address'
  if (field === 'name') return 'Invalid name'
  if (field === 'company') return 'Invalid company'
  return first?.message || 'Invalid contact data'
}

/**
 * Same name/email/company rules as create-contact. Empty values are omitted.
 */
export async function validateContactProfileFields(
  input: ContactProfileFields
): Promise<{ ok: true; value: ContactProfileFields } | { ok: false; message: string }> {
  try {
    const value = await contactProfileFieldsValidator.validate({
      name: input.name || undefined,
      email: input.email || undefined,
      company: input.company || undefined,
    })
    return { ok: true, value }
  } catch (error) {
    if (error instanceof errors.E_VALIDATION_ERROR) {
      return {
        ok: false,
        message: profileValidationMessage(error.messages as VineFieldError[]),
      }
    }
    throw error
  }
}

export const importContactsValidator = vine.create(
  vine.object({
    defaultCountryCode: vine
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    columnMapping: vine
      .object({
        phone: vine.string().trim().minLength(1).maxLength(100).optional(),
        name: vine.string().trim().minLength(1).maxLength(100).optional(),
        email: vine.string().trim().minLength(1).maxLength(100).optional(),
        company: vine.string().trim().minLength(1).maxLength(100).optional(),
      })
      .optional(),
  })
)

export const contactIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)
