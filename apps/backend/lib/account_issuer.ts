/**
 * Better Auth 1.7 briefly required `accounts.issuer` (identity namespace).
 * Staging already has NOT NULL + unique (issuer, accountId). Credential and
 * Google rows use the namespaces BA documented for those providers.
 */
export const CREDENTIAL_ACCOUNT_ISSUER = 'local:credential'
export const GOOGLE_ACCOUNT_ISSUER = 'https://accounts.google.com'

export function accountIssuerForProvider(providerId: string): string {
  const id = providerId.trim()
  if (id === 'credential') return CREDENTIAL_ACCOUNT_ISSUER
  if (id === 'google') return GOOGLE_ACCOUNT_ISSUER
  return `local:oauth:${encodeURIComponent(id)}`
}
