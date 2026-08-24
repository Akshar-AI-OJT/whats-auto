import {
  api,
  type ApiError,
  type CreateSuperAdminSubscriptionBody,
  type PaginationMeta,
  type SuperAdminPlan,
  type SuperAdminPlanStatus,
  type SuperAdminSubscription,
  type SuperAdminSubscriptionStatus,
  type UpdateSuperAdminSubscriptionBody,
} from '@/lib/api'

export const SUBSCRIPTION_STATUSES: SuperAdminSubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
]

export type PlanSelectOption = {
  id: string
  label: string
  price: number | null
  currency: string
  billingPeriod: SuperAdminPlan['billingPeriod']
  status: SuperAdminPlanStatus
}

function unwrapPlansPayload(data: unknown): SuperAdminPlan[] {
  if (!data) return []
  const root = data as {
    data?: { items?: SuperAdminPlan[] } | SuperAdminPlan[]
    items?: SuperAdminPlan[]
  }
  if (Array.isArray(root.data)) return root.data
  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.items)) {
    return root.data.items
  }
  if (Array.isArray(root.items)) return root.items
  return []
}

/** Live Super Admin plans catalog (`GET /api/v1/super-admin/plans`). */
export async function listSuperAdminPlansCatalog(
  status: SuperAdminPlanStatus | 'all' = 'all'
): Promise<SuperAdminPlan[]> {
  const { data } = await api.superAdmin.plans.list({ status })
  return unwrapPlansPayload(data)
}

export function findPlanById(
  plans: SuperAdminPlan[],
  planId: string | null | undefined
): SuperAdminPlan | undefined {
  if (!planId) return undefined
  return plans.find((plan) => plan.id === planId)
}

export function planLabel(planId: string, plans: SuperAdminPlan[]): string {
  const plan = findPlanById(plans, planId)
  if (plan?.name?.trim()) return plan.name.trim()
  if (plan?.code?.trim()) return plan.code.trim()
  return planId.slice(0, 8)
}

export function formatPlanPrice(
  plan: SuperAdminPlan | undefined,
  customLabel: string
): string {
  if (!plan || plan.price == null) return customLabel
  const currency = (plan.currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(plan.price)
  } catch {
    return `${currency} ${plan.price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
}

export function planAmountLabel(
  planId: string,
  plans: SuperAdminPlan[],
  customLabel: string
): string {
  return formatPlanPrice(findPlanById(plans, planId), customLabel)
}

/** Maps API billingPeriod into the subscriptions UI filter buckets. */
export function planBillingKind(
  planId: string,
  plans: SuperAdminPlan[]
): 'monthly' | 'custom' {
  const plan = findPlanById(plans, planId)
  if (!plan) return 'custom'
  if (plan.billingPeriod === 'custom' || plan.price == null) return 'custom'
  return 'monthly'
}

/**
 * Options for plan selects. Prefer active plans; always include any `includeIds`
 * so existing subscriptions remain editable even if the plan was archived.
 */
export function toPlanSelectOptions(
  plans: SuperAdminPlan[],
  options: { activeOnly?: boolean; includeIds?: string[] } = {}
): PlanSelectOption[] {
  const include = new Set(options.includeIds?.filter(Boolean) ?? [])
  const filtered = plans.filter((plan) => {
    if (include.has(plan.id)) return true
    if (options.activeOnly) {
      return plan.status === 'active' || plan.isActive === true
    }
    return plan.status !== 'archived'
  })

  const byId = new Map<string, SuperAdminPlan>()
  for (const plan of filtered) byId.set(plan.id, plan)

  return [...byId.values()]
    .sort((a, b) => {
      const orderA = a.sortOrder ?? 0
      const orderB = b.sortOrder ?? 0
      if (orderA !== orderB) return orderA - orderB
      return a.name.localeCompare(b.name)
    })
    .map((plan) => ({
      id: plan.id,
      label: plan.name?.trim() || plan.code || plan.id.slice(0, 8),
      price: plan.price,
      currency: plan.currency,
      billingPeriod: plan.billingPeriod,
      status: plan.status,
    }))
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
