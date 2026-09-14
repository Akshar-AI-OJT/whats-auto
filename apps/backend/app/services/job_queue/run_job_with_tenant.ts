import { runWithTenant } from '#services/tenant_context'

/**
 * Bind RLS tenant context from a job payload. AI and other org-scoped
 * handlers should run their service work inside this wrapper.
 */
export function runJobWithTenant<T>(
  data: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const organizationId = data.organizationId
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    throw new Error('Job payload missing organizationId')
  }
  return runWithTenant(organizationId, fn)
}
