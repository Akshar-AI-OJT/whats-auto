/** Must stay in sync with `apps/backend/lib/contact_phone.ts`. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/

/**
 * Canonical CRM contact phone: `91XXXXXXXXXX`.
 * Returns null when the input is not a valid Indian mobile number.
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
