import { symmetricDecrypt } from 'better-auth/crypto'
import { pool } from '#lib/db'

type SecretConfig = Parameters<typeof symmetricDecrypt>[0]['key']

/**
 * Better Auth encrypts JWKS private keys with BETTER_AUTH_SECRET (or a
 * versioned secretConfig). After a secret/format change the stored ciphertext
 * cannot be decrypted, and get-session /token throw instead of minting a JWT —
 * the SPA then treats a valid session cookie as logged-out.
 */
export async function isJwkPrivateKeyReadable(
  secretConfig: SecretConfig,
  privateKey: string
): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(privateKey)

    // Plaintext JWK (disablePrivateKeyEncryption) — usable as-is.
    if (parsed && typeof parsed === 'object' && 'kty' in parsed) {
      return true
    }

    if (typeof parsed !== 'string') {
      return false
    }

    await symmetricDecrypt({
      key: secretConfig,
      data: parsed,
    })
    return true
  } catch {
    return false
  }
}

export async function selectDecryptableJwks<T extends { id: string; privateKey: string }>(
  secretConfig: SecretConfig,
  keys: T[]
): Promise<{ usable: T[]; staleIds: string[] }> {
  const usable: T[] = []
  const staleIds: string[] = []

  for (const key of keys) {
    if (await isJwkPrivateKeyReadable(secretConfig, key.privateKey)) {
      usable.push(key)
    } else {
      staleIds.push(key.id)
    }
  }

  return { usable, staleIds }
}

export async function deleteStaleJwks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await pool.query(`DELETE FROM "jwks" WHERE "id" = ANY($1::uuid[])`, [ids])
}
