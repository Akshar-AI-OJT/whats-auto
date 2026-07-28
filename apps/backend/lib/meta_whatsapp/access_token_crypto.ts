import encryption from '@adonisjs/core/services/encryption'

/**
 * Encrypt / decrypt WhatsApp tenant access tokens at rest (APP_KEY / AES-GCM).
 * Keep all token crypto in this module so inbox/send paths share one seam.
 */
export function encryptWhatsappAccessToken(plainToken: string): string {
  return encryption.encrypt(plainToken)
}

export function decryptWhatsappAccessToken(ciphertext: string): string {
  const plain = encryption.decrypt(ciphertext)
  if (typeof plain !== 'string' || !plain) {
    throw new Error('Failed to decrypt WhatsApp access token')
  }
  return plain
}

export function generateWhatsappRegistrationPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}
