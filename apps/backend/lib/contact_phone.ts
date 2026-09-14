import parsePhoneNumberFromString, { isSupportedCountry } from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'
import ContactException from '#exceptions/contact_exception'

/**
 * Canonical CRM / WhatsApp contact phone: country calling code + national number,
 * digits only (no `+`, spaces, or punctuation).
 *
 * National numbers require an ISO 3166-1 alpha-2 `countryCode`.
 * International numbers (leading `+`) are parsed without a country.
 * Digits-only values that are already a complete E.164 number (Meta `wa_id`
 * style, e.g. `14155552671`) are parsed as international before any default
 * country is applied, so they are not prefixed with that country's calling code.
 */
export function normalizeContactPhone(phoneNumber: string, countryCode?: string): string {
  const trimmed = typeof phoneNumber === 'string' ? phoneNumber.trim() : ''
  if (!trimmed) {
    throw ContactException.invalidPhone()
  }

  const country = parseIsoCountry(countryCode)
  const international = isInternationalNumber(trimmed)

  if (!international) {
    const fromDigits = tryNormalizeInternationalDigits(trimmed)
    if (fromDigits) {
      return fromDigits
    }
  }

  if (!international && !country) {
    throw ContactException.invalidPhone()
  }

  const parsed = international
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, country)

  if (!parsed || !parsed.isValid()) {
    throw ContactException.invalidPhone()
  }

  return `${parsed.countryCallingCode}${parsed.nationalNumber}`
}

/**
 * Meta `wa_id` is already country calling code + national number (digits, optional `+`).
 * Parse it as international — never as a national number, and never with org country.
 */
export function normalizeWhatsappWaId(waId: string): string {
  const trimmed = typeof waId === 'string' ? waId.trim() : ''
  if (!trimmed) {
    throw ContactException.invalidPhone()
  }

  const international = trimmed.startsWith('+') ? trimmed : `+${trimmed}`
  try {
    return normalizeContactPhone(international)
  } catch (error) {
    const parsed = parsePhoneNumberFromString(international)
    if (parsed?.isPossible()) {
      return `${parsed.countryCallingCode}${parsed.nationalNumber}`
    }
    throw error
  }
}

function parseIsoCountry(countryCode: string | undefined): CountryCode | undefined {
  if (typeof countryCode !== 'string') {
    return undefined
  }

  const iso = countryCode.trim().toUpperCase()
  if (!iso) {
    return undefined
  }

  if (!isSupportedCountry(iso)) {
    throw ContactException.invalidPhone()
  }

  return iso
}

function isInternationalNumber(value: string): boolean {
  return value.replace(/^[\s().-]+/, '').startsWith('+')
}

/**
 * Digits-only Meta / WhatsApp `wa_id` (country calling code + national number,
 * no `+`). Trunk-prefixed national numbers (leading 0) are never treated as
 * international. The canonical E.164 digits must equal the input digits so a
 * 10-digit national number is not stolen by another country's calling code.
 */
function tryNormalizeInternationalDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (!digits || digits.startsWith('0')) {
    return null
  }

  const parsed = parsePhoneNumberFromString(`+${digits}`)
  if (!parsed?.isValid()) {
    return null
  }

  const canonical = `${parsed.countryCallingCode}${parsed.nationalNumber}`
  if (canonical !== digits) {
    return null
  }

  return canonical
}

export function isInternationalContactPhone(phoneNumber: string): boolean {
  const trimmed = typeof phoneNumber === 'string' ? phoneNumber.trim() : ''
  if (!trimmed) {
    return false
  }
  return isInternationalNumber(trimmed) || Boolean(tryNormalizeInternationalDigits(trimmed))
}

export function normalizeIsoCountryCode(countryCode: string | undefined): string | undefined {
  return parseIsoCountry(countryCode)
}
