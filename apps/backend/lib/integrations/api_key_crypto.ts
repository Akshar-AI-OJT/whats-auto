import { createHash, randomBytes } from 'node:crypto'

const LIVE_PREFIX = 'wta_live_'
const PREFIX_HEX_LENGTH = 8
const SECRET_HEX_LENGTH = 32

export type GeneratedApiKey = {
  rawToken: string
  keyPrefix: string
  keyHash: string
}

export function hashApiKey(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function generateApiKey(): GeneratedApiKey {
  const prefixHex = randomBytes(PREFIX_HEX_LENGTH / 2).toString('hex')
  const secretHex = randomBytes(SECRET_HEX_LENGTH / 2).toString('hex')
  const keyPrefix = `${LIVE_PREFIX}${prefixHex}`
  const rawToken = `${keyPrefix}_${secretHex}`
  return {
    rawToken,
    keyPrefix,
    keyHash: hashApiKey(rawToken),
  }
}
