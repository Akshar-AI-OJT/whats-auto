import ContactException from '#exceptions/contact_exception'

const INDIAN_MOBILE = /^[6-9]\d{9}$/

/**
 * Canonical CRM / WhatsApp contact phone: `91XXXXXXXXXX`
 * (India country code + 10-digit mobile starting 6–9).
 *
 * Accepts common input shapes: `9909912691`, `919909912691`,
 * `+91 99099 12691`, `09909912691`, `0091 9909912691`.
 */
export function canonicalizeIndianMobile(phone: string): string | null {
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  if (digits.length === 13 && digits.startsWith('910') && INDIAN_MOBILE.test(digits.slice(3))) {
    return `91${digits.slice(3)}`
  }

  if (digits.length === 11 && digits.startsWith('0') && INDIAN_MOBILE.test(digits.slice(1))) {
    return `91${digits.slice(1)}`
  }

  if (digits.length === 12 && digits.startsWith('91') && INDIAN_MOBILE.test(digits.slice(2))) {
    return digits
  }

  if (digits.length === 10 && INDIAN_MOBILE.test(digits)) {
    return `91${digits}`
  }

  return null
}

export function isValidContactPhone(phone: string): boolean {
  return canonicalizeIndianMobile(phone) !== null
}

/** Digits-only form used for unique matching (org + phoneNormalized). */
export function normalizeContactPhone(phone: string): string {
  const canonical = canonicalizeIndianMobile(phone)
  if (!canonical) {
    throw ContactException.invalidPhone()
  }
  return canonical
}
