const ORG_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SPACE_SEGMENT = /^[a-z0-9][a-z0-9:._-]{0,159}$/i
const SHA256_HEX = /^[a-f0-9]{64}$/

export const TENANT_REDIS_KEY_PREFIX = 'wa:org'

export type TenantRedisKeyKind = 'flowbuf' | 'memory' | 'debounce'

function assertUuidSegment(value: string, label: string): string {
  if (!ORG_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label} for Redis key: must be a UUID`)
  }
  return value
}

/**
 * Tenant-scoped Redis key. Every key includes organizationId so a missed
 * filter cannot read another org's flow buffer, memory, or answer-cache entries.
 */
export function tenantRedisKey(
  kind: TenantRedisKeyKind,
  organizationId: string,
  conversationId: string
): string {
  const orgId = assertUuidSegment(organizationId, 'organizationId')
  const convId = assertUuidSegment(conversationId, 'conversationId')
  return `${TENANT_REDIS_KEY_PREFIX}:${orgId}:${kind}:${convId}`
}

export function tenantAnswerCacheKey(
  organizationId: string,
  embeddingSpaceId: string,
  questionHash: string
): string {
  const orgId = assertUuidSegment(organizationId, 'organizationId')
  if (!SPACE_SEGMENT.test(embeddingSpaceId)) {
    throw new Error('Invalid embeddingSpaceId for Redis key')
  }
  if (!SHA256_HEX.test(questionHash)) {
    throw new Error('Invalid questionHash for Redis key')
  }
  return `${TENANT_REDIS_KEY_PREFIX}:${orgId}:answer:${embeddingSpaceId}:${questionHash}`
}

export function assertTenantRedisKey(key: string): void {
  if (!key.startsWith(`${TENANT_REDIS_KEY_PREFIX}:`)) {
    throw new Error(`Refusing Redis key outside ${TENANT_REDIS_KEY_PREFIX}: prefix`)
  }
}
