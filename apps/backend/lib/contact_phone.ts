import parsePhoneNumberFromString, { isSupportedCountry } from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'
import ContactException from '#exceptions/contact_exception'

/**
 * Canonical CRM / WhatsApp contact phone: country calling code + national number,
 * digits only (no `+`, spaces, or punctuation).
 *
 * National numbers require an ISO 3166-1 alpha-2 `countryCode`.
 * International numbers (leading `+`) are parsed without a country.
 */
export function normalizeContactPhone(phoneNumber: string, countryCode?: string): string {
  const trimmed = typeof phoneNumber === 'string' ? phoneNumber.trim() : ''
  if (!trimmed) {
    throw ContactException.invalidPhone()
  }

  const country = parseIsoCountry(countryCode)
  const international = isInternationalNumber(trimmed)

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

export function isInternationalContactPhone(phoneNumber: string): boolean {
  return isInternationalNumber(typeof phoneNumber === 'string' ? phoneNumber.trim() : '')
}

export function normalizeIsoCountryCode(countryCode: string | undefined): string | undefined {
  return parseIsoCountry(countryCode)
}
