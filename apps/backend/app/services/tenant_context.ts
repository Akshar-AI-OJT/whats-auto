import { AsyncLocalStorage } from 'node:async_hooks'

type TenantStore = {
  organizationId: string
}

const tenantStorage = new AsyncLocalStorage<TenantStore>()

/**
 * Active organization for the current async context (HTTP request or job).
 * Used to stamp PostgreSQL `app.current_organization_id` for RLS.
 */
export function getTenantOrganizationId(): string | undefined {
  return tenantStorage.getStore()?.organizationId
}

/**
 * Run `fn` with a tenant organization bound to AsyncLocalStorage.
 * Tenant middleware uses this so every DB connection acquired during the
 * request can set the RLS GUC from the same org id.
 */
export function runWithTenant<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ organizationId }, fn)
}
