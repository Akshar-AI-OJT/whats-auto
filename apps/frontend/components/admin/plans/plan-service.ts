/**
 * Plan catalog data-access layer (mock-backed).
 *
 * Swap the bodies of these functions to real `api.superAdmin.plans.*` calls later
 * without rewriting the Plans UI.
 */

import { MOCK_PLANS_SEED } from './mock-plans'
import type {
  CreatePlanInput,
  ListPlansParams,
  PlanActionResult,
  PlanSummary,
  SubscriptionPlan,
  UpdatePlanInput,
} from './types'

const LATENCY_MS = 160

let store: SubscriptionPlan[] = structuredClone(MOCK_PLANS_SEED)

function delay(ms = LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clonePlan(plan: SubscriptionPlan): SubscriptionPlan {
  return structuredClone(plan)
}

function matchesSearch(plan: SubscriptionPlan, search: string) {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return (
    plan.name.toLowerCase().includes(q) ||
    plan.description.toLowerCase().includes(q) ||
    plan.status.toLowerCase().includes(q)
  )
}

export async function listPlans(
  params: ListPlansParams = {}
): Promise<{ items: SubscriptionPlan[]; summary: PlanSummary }> {
  await delay()
  const status = params.status ?? 'all'
  const items = store
    .filter((plan) => {
      if (status !== 'all' && plan.status !== status) return false
      return matchesSearch(plan, params.search ?? '')
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(clonePlan)

  const popular = store.find((plan) => plan.popular && plan.status === 'active')
  const summary: PlanSummary = {
    total: store.length,
    active: store.filter((plan) => plan.status === 'active').length,
    draft: store.filter((plan) => plan.status === 'draft').length,
    archived: store.filter((plan) => plan.status === 'archived').length,
    popularName: popular?.name ?? null,
  }

  return { items, summary }
}

export async function getPlan(id: string): Promise<SubscriptionPlan | null> {
  await delay()
  const found = store.find((plan) => plan.id === id)
  return found ? clonePlan(found) : null
}

export async function createPlan(input: CreatePlanInput): Promise<SubscriptionPlan> {
  await delay(220)
  const now = new Date().toISOString()
  const plan: SubscriptionPlan = {
    id: `plan_${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    price: input.price,
    currency: input.currency,
    billingPeriod: input.billingPeriod,
    status: input.status,
    popular: Boolean(input.popular),
    trialDays: input.trialDays,
    limits: input.limits,
    features: structuredClone(input.features),
    createdAt: now,
    updatedAt: now,
  }
  store = [plan, ...store]
  return clonePlan(plan)
}

export async function updatePlan(
  id: string,
  input: UpdatePlanInput
): Promise<PlanActionResult> {
  await delay(220)
  const index = store.findIndex((plan) => plan.id === id)
  if (index < 0) return { ok: false, reason: 'not_found', messageKey: 'errors.notFound' }

  const current = store[index]
  const updated: SubscriptionPlan = {
    ...current,
    ...input,
    name: input.name?.trim() ?? current.name,
    description: input.description?.trim() ?? current.description,
    limits: input.limits ?? current.limits,
    features: input.features ? structuredClone(input.features) : current.features,
    updatedAt: new Date().toISOString(),
  }
  store[index] = updated
  return { ok: true, plan: clonePlan(updated), messageKey: 'toast.updated' }
}

export async function archivePlan(id: string): Promise<PlanActionResult> {
  await delay()
  const index = store.findIndex((plan) => plan.id === id)
  if (index < 0) return { ok: false, reason: 'not_found', messageKey: 'errors.notFound' }

  const updated: SubscriptionPlan = {
    ...store[index],
    status: 'archived',
    popular: false,
    updatedAt: new Date().toISOString(),
  }
  store[index] = updated
  return { ok: true, plan: clonePlan(updated), messageKey: 'toast.archived' }
}

export function __resetPlanStoreForTests() {
  store = structuredClone(MOCK_PLANS_SEED)
}
