const ORG_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const TENANT_REDIS_KEY_PREFIX = 'wa:org'

export type TenantRedisKeyKind = 'debounce' | 'memory'

function assertUuidSegment(value: string, label: string): string {
  if (!ORG_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label} for Redis key: must be a UUID`)
  }
  return value
}

/**
 * Tenant-scoped Redis key. Every key includes organizationId so a missed
 * filter cannot read another org's debounce or memory lists.
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

export function assertTenantRedisKey(key: string): void {
  if (!key.startsWith(`${TENANT_REDIS_KEY_PREFIX}:`)) {
    throw new Error(`Refusing Redis key outside ${TENANT_REDIS_KEY_PREFIX}: prefix`)
  }
}
