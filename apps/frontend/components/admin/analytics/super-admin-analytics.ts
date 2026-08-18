'use client'

import {
  api,
  type AuthorizationAuditEvent,
  type PaginationMeta,
  type SuperAdminInvoiceSummary,
  type SuperAdminOrganization,
  type SuperAdminPlan,
  type SuperAdminSubscription,
} from '@/lib/api'

export type BreakdownItem = {
  key: string
  label: string
  value: number
}

export type GrowthPoint = {
  key: string
  label: string
  created: number
  cumulative: number
}

function unwrapPaginated<T>(payload: unknown): { items: T[]; meta: PaginationMeta | null } {
  if (!payload) return { items: [], meta: null }
  if (Array.isArray(payload)) return { items: payload, meta: null }

  const root = payload as {
    data?: T[] | { data?: T[]; meta?: PaginationMeta }
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

function unwrapList<T>(payload: unknown): T[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload as T[]
  const root = payload as { data?: T[] }
  return Array.isArray(root.data) ? root.data : []
}

export async function fetchAllOrganizations(): Promise<{
  items: SuperAdminOrganization[]
  total: number
}> {
  const perPage = 100
  const { data } = await api.superAdmin.organizations.list({ page: 1, perPage })
  const first = unwrapPaginated<SuperAdminOrganization>(data)
  const total = first.meta?.total ?? first.items.length
  const lastPage = first.meta?.lastPage ?? 1
  const items = [...first.items]

  for (let page = 2; page <= lastPage; page += 1) {
    const next = await api.superAdmin.organizations.list({ page, perPage })
    const nextUnwrapped = unwrapPaginated<SuperAdminOrganization>(next.data)
    items.push(...nextUnwrapped.items)
  }

  return { items, total }
}

export async function fetchAllSubscriptions(): Promise<SuperAdminSubscription[]> {
  const perPage = 100
  const { data } = await api.superAdmin.subscriptions.list({ page: 1, perPage })
  const first = unwrapPaginated<SuperAdminSubscription>(data)
  const lastPage = first.meta?.lastPage ?? 1
  const items = [...first.items]

  for (let page = 2; page <= lastPage; page += 1) {
    const next = await api.superAdmin.subscriptions.list({ page, perPage })
    const nextUnwrapped = unwrapPaginated<SuperAdminSubscription>(next.data)
    items.push(...nextUnwrapped.items)
  }

  return items
}

export async function fetchAllPlans(): Promise<SuperAdminPlan[]> {
  const { data } = await api.superAdmin.plans.list({ status: 'all' })
  const root = data as { data?: { items?: SuperAdminPlan[] } }
  return Array.isArray(root?.data?.items) ? root.data.items : []
}

export async function fetchInvoiceSummary(): Promise<SuperAdminInvoiceSummary | null> {
  const { data } = await api.superAdmin.invoices.summary()
  if (!data) return null
  if (typeof data === 'object' && data !== null && 'totalCount' in data) {
    return data as SuperAdminInvoiceSummary
  }
  const root = data as { data?: SuperAdminInvoiceSummary }
  return root.data ?? null
}

export async function fetchRecentAudit(): Promise<AuthorizationAuditEvent[]> {
  const { data } = await api.audit.list({ limit: 10 })
  return unwrapList<AuthorizationAuditEvent>(data)
}

export function buildOrganizationGrowth(
  organizations: SuperAdminOrganization[],
  locale: string,
  months = 6
): GrowthPoint[] {
  const activeRows = organizations.filter((item) => item.deletedAt == null)
  const now = new Date()
  const monthStarts: Date[] = []

  for (let i = months - 1; i >= 0; i -= 1) {
    monthStarts.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
  }

  const createdByMonth = new Map<string, number>()
  for (const row of activeRows) {
    const date = new Date(row.createdAt)
    if (Number.isNaN(date.getTime())) continue
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    createdByMonth.set(key, (createdByMonth.get(key) ?? 0) + 1)
  }

  const firstMonthStart = monthStarts[0]!
  let baselineTotal = 0
  for (const row of activeRows) {
    const date = new Date(row.createdAt)
    if (Number.isNaN(date.getTime())) continue
    if (date < firstMonthStart) baselineTotal += 1
  }

  let cumulative = baselineTotal
  return monthStarts.map((monthDate) => {
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
    const created = createdByMonth.get(key) ?? 0
    cumulative += created
    return {
      key,
      label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(monthDate),
      created,
      cumulative,
    }
  })
}

export function computeCurrentOrganizationSplit(
  organizations: SuperAdminOrganization[]
): BreakdownItem[] {
  let active = 0
  let inactive = 0

  for (const org of organizations) {
    if (org.deletedAt != null) continue
    if (org.status === true) active += 1
    else inactive += 1
  }

  return [
    { key: 'active', label: 'active', value: active },
    { key: 'inactive', label: 'inactive', value: inactive },
  ]
}

export function computePlanDistribution(
  subscriptions: SuperAdminSubscription[],
  plans: SuperAdminPlan[]
): BreakdownItem[] {
  const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]))
  const counts = new Map<string, BreakdownItem>()

  for (const subscription of subscriptions) {
    const planId = subscription.planId
    const existing = counts.get(planId)
    if (existing) {
      existing.value += 1
      continue
    }
    counts.set(planId, {
      key: planId,
      label: planNameById.get(planId) ?? planId,
      value: 1,
    })
  }

  return [...counts.values()].sort((a, b) => b.value - a.value)
}

export function countTrialOrganizations(subscriptions: SuperAdminSubscription[]): number {
  const trialingOrgs = new Set<string>()
  for (const subscription of subscriptions) {
    if (String(subscription.status).toLowerCase() === 'trialing') {
      trialingOrgs.add(subscription.organizationId)
    }
  }
  return trialingOrgs.size
}

export function formatCurrency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}
