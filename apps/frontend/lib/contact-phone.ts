/** Client-side shape check only. Canonical parsing lives in the backend normalizer. */
export function isInternationalContactPhone(phoneNumber: string): boolean {
  return phoneNumber.trim().replace(/^[\s().-]+/, '').startsWith('+')
}
