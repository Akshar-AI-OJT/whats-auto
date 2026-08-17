import encryption from '@adonisjs/core/services/encryption'

/**
 * Encrypt / decrypt third-party store secrets at rest (APP_KEY / AES-GCM).
 */
export function encryptIntegrationSecret(plainSecret: string): string {
  return encryption.encrypt(plainSecret)
}

export function decryptIntegrationSecret(ciphertext: string): string {
  const plain = encryption.decrypt(ciphertext)
  if (typeof plain !== 'string' || !plain) {
    throw new Error('Failed to decrypt integration secret')
  }
  return plain
}
