import {
  api,
  type ApiError,
  type CreateSuperAdminSubscriptionBody,
  type PaginationMeta,
  type SuperAdminSubscription,
  type SuperAdminSubscriptionStatus,
  type UpdateSuperAdminSubscriptionBody,
} from '@/lib/api'
import { PLANS, planKeyFromCheckoutPlanId, type PlanConfig } from '@/lib/plan-config'

/** Demo-seeded plan UUIDs (stableUuid) — used only when no plans catalog API exists. */
export const DEMO_PLAN_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '55c5e165-97f1-45b0-b3d1-801b79f4ff98', label: 'Starter' },
  { id: '4854c623-f7d6-45a1-a4cd-a262e652f57a', label: 'Growth' },
  { id: 'b1aaef4d-7933-4965-9cff-69217166513d', label: 'Scale' },
]

export const SUBSCRIPTION_STATUSES: SuperAdminSubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
]

export function planConfigForSubscription(planId: string): PlanConfig | undefined {
  const key = planKeyFromCheckoutPlanId(planId)
  return key ? PLANS.find((plan) => plan.id === key) : undefined
}

export function planLabel(planId: string): string {
  const config = planConfigForSubscription(planId)
  if (config) {
    const match = DEMO_PLAN_OPTIONS.find((plan) => plan.id === planId)
    return match?.label ?? config.id
  }
  return DEMO_PLAN_OPTIONS.find((plan) => plan.id === planId)?.label ?? planId.slice(0, 8)
}

export function planAmountLabel(planId: string, customLabel: string): string {
  const config = planConfigForSubscription(planId)
  if (!config || config.priceMonthly == null) return customLabel
  return `$${config.priceMonthly.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function planBillingKind(planId: string): 'monthly' | 'custom' {
  const config = planConfigForSubscription(planId)
  return config?.priceMonthly == null ? 'custom' : 'monthly'
}

function unwrapPaginated(
  data: unknown
): { items: SuperAdminSubscription[]; meta: PaginationMeta | null } {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) return { items: data, meta: null }

  const root = data as {
    data?: SuperAdminSubscription[] | { data?: SuperAdminSubscription[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return { items: root.data.data, meta: root.data.meta ?? root.meta ?? null }
  }

  return { items: [], meta: null }
}

function unwrapSubscription(data: unknown): SuperAdminSubscription {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid subscription response')
  }
  const root = data as { data?: SuperAdminSubscription } & SuperAdminSubscription
  if (root.data && typeof root.data === 'object' && 'id' in root.data) {
    return root.data
  }
  return root as SuperAdminSubscription
}

export async function listSuperAdminSubscriptions(params: {
  page?: number
  perPage?: number
}): Promise<{ items: SuperAdminSubscription[]; meta: PaginationMeta | null }> {
  const { data } = await api.superAdmin.subscriptions.list(params)
  return unwrapPaginated(data)
}

export async function listAllSuperAdminSubscriptions(): Promise<SuperAdminSubscription[]> {
  const perPage = 100
  let page = 1
  let lastPage = 1
  const all: SuperAdminSubscription[] = []

  do {
    const { items, meta } = await listSuperAdminSubscriptions({ page, perPage })
    all.push(...items)
    lastPage = meta?.lastPage ?? page
    page += 1
  } while (page <= lastPage && page <= 20)

  return all
}

export async function getSuperAdminSubscription(
  subscriptionId: string
): Promise<SuperAdminSubscription> {
  const { data } = await api.superAdmin.subscriptions.get(subscriptionId)
  return unwrapSubscription(data)
}

export async function createSuperAdminSubscription(
  body: CreateSuperAdminSubscriptionBody
): Promise<SuperAdminSubscription> {
  const { data } = await api.superAdmin.subscriptions.create(body)
  return unwrapSubscription(data)
}

export async function updateSuperAdminSubscription(
  subscriptionId: string,
  body: UpdateSuperAdminSubscriptionBody
): Promise<SuperAdminSubscription> {
  const { data } = await api.superAdmin.subscriptions.update(subscriptionId, body)
  return unwrapSubscription(data)
}

export async function deleteSuperAdminSubscription(subscriptionId: string): Promise<void> {
  await api.superAdmin.subscriptions.destroy(subscriptionId)
}

export {
  dateInputToVineDate as dateInputToIso,
  vineDateToDateInput as isoToDateInput,
} from '@/lib/vine-date'

export function mapSubscriptionApiError(error: unknown, fallback: string): string {
  const apiError = error as ApiError
  if (apiError.status === 401) return 'Your session expired. Please sign in again.'
  if (apiError.status === 403) return 'You do not have permission for this action.'
  if (apiError.code === 'E_SUBSCRIPTION_NOT_FOUND') return 'Subscription not found.'
  if (apiError.code === 'E_ORGANIZATION_NOT_FOUND') return 'Organization not found.'
  if (apiError.code === 'E_PLAN_NOT_FOUND') return 'Plan not found.'
  if (apiError.code === 'E_SUBSCRIPTION_INVALID_PERIOD') {
    return 'End date must be after start date.'
  }
  if (apiError.code === 'E_SUBSCRIPTION_ALREADY_DELETED') {
    return 'Subscription is already cancelled.'
  }
  return apiError.message || fallback
}
