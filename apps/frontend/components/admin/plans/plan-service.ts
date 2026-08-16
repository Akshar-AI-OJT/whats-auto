/**
 * Plan catalog data-access layer (live API).
 *
 * UI keeps the SubscriptionPlan shape; this module maps super-admin plan DTOs.
 */

import {
  api,
  type ApiError,
  type CreateSuperAdminPlanBody,
  type SuperAdminPlan,
  type SuperAdminPlanFeature,
  type UpdateSuperAdminPlanBody,
} from '@/lib/api'
import type {
  CreatePlanInput,
  ListPlansParams,
  PlanActionResult,
  PlanFeature,
  PlanSummary,
  SubscriptionPlan,
  UpdatePlanInput,
} from './types'

function unwrapPlan(data: unknown): SuperAdminPlan {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid plan response')
  }
  const root = data as { data?: SuperAdminPlan } & SuperAdminPlan
  if (root.data && typeof root.data === 'object' && 'id' in root.data) {
    return root.data
  }
  return root as SuperAdminPlan
}

function toSubscriptionPlan(plan: SuperAdminPlan): SubscriptionPlan {
  const features: PlanFeature[] = (plan.features ?? []).map((feature: SuperAdminPlanFeature) => ({
    key: feature.key,
    name: feature.name || feature.key,
    enabled: Boolean(feature.enabled),
    description: feature.description,
    category: feature.category ?? 'messaging',
  }))

  return {
    id: plan.id,
    name: plan.name,
    description: plan.description ?? '',
    price: plan.price,
    currency: (plan.currency?.toUpperCase() === 'USD' ? 'USD' : 'INR') as 'INR' | 'USD',
    billingPeriod: plan.billingPeriod,
    status: plan.status,
    popular: Boolean(plan.popular),
    trialDays: plan.trialDays,
    limits: {
      users: plan.limits?.users ?? null,
      messagesPerMonth: plan.limits?.messagesPerMonth ?? null,
      workspaces: plan.limits?.workspaces ?? null,
    },
    features,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt ?? plan.createdAt,
  }
}

function toCreateBody(input: CreatePlanInput): CreateSuperAdminPlanBody {
  return {
    name: input.name,
    description: input.description,
    price: input.price,
    currency: input.currency,
    billingPeriod: input.billingPeriod,
    status: input.status,
    popular: Boolean(input.popular),
    trialDays: input.trialDays,
    limits: input.limits,
    features: input.features.map((feature) => ({
      key: feature.key,
      name: feature.name,
      enabled: feature.enabled,
      description: feature.description,
      category: feature.category,
    })),
  }
}

function toUpdateBody(input: UpdatePlanInput): UpdateSuperAdminPlanBody {
  const body: UpdateSuperAdminPlanBody = {}
  if (input.name !== undefined) body.name = input.name
  if (input.description !== undefined) body.description = input.description
  if (input.price !== undefined) body.price = input.price
  if (input.currency !== undefined) body.currency = input.currency
  if (input.billingPeriod !== undefined) body.billingPeriod = input.billingPeriod
  if (input.status !== undefined) body.status = input.status
  if (input.popular !== undefined) body.popular = input.popular
  if (input.trialDays !== undefined) body.trialDays = input.trialDays
  if (input.limits !== undefined) body.limits = input.limits
  if (input.features !== undefined) {
    body.features = input.features.map((feature) => ({
      key: feature.key,
      name: feature.name,
      enabled: feature.enabled,
      description: feature.description,
      category: feature.category,
    }))
  }
  return body
}

function isNotFound(error: unknown): boolean {
  const apiError = error as ApiError | undefined
  return Boolean(apiError && (apiError.status === 404 || apiError.code === 'E_PLAN_NOT_FOUND'))
}

export async function listPlans(
  params: ListPlansParams = {}
): Promise<{ items: SubscriptionPlan[]; summary: PlanSummary }> {
  const { data } = await api.superAdmin.plans.list({
    search: params.search,
    status: params.status,
  })
  const payload =
    (data as { data?: { items: SuperAdminPlan[]; summary: PlanSummary } })?.data ??
    (data as { items?: SuperAdminPlan[]; summary?: PlanSummary })

  const items = (payload.items ?? []).map(toSubscriptionPlan)
  const summary = payload.summary ?? {
    total: items.length,
    active: items.filter((plan) => plan.status === 'active').length,
    draft: items.filter((plan) => plan.status === 'draft').length,
    archived: items.filter((plan) => plan.status === 'archived').length,
    popularName: items.find((plan) => plan.popular && plan.status === 'active')?.name ?? null,
  }

  return { items, summary }
}

export async function getPlan(id: string): Promise<SubscriptionPlan | null> {
  try {
    const { data } = await api.superAdmin.plans.get(id)
    return toSubscriptionPlan(unwrapPlan(data))
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function createPlan(input: CreatePlanInput): Promise<SubscriptionPlan> {
  const { data } = await api.superAdmin.plans.create(toCreateBody(input))
  return toSubscriptionPlan(unwrapPlan(data))
}

export async function updatePlan(id: string, input: UpdatePlanInput): Promise<PlanActionResult> {
  try {
    const { data } = await api.superAdmin.plans.update(id, toUpdateBody(input))
    return { ok: true, plan: toSubscriptionPlan(unwrapPlan(data)), messageKey: 'toast.updated' }
  } catch (error) {
    if (isNotFound(error)) {
      return { ok: false, reason: 'not_found', messageKey: 'errors.notFound' }
    }
    throw error
  }
}

export async function archivePlan(id: string): Promise<PlanActionResult> {
  try {
    const { data } = await api.superAdmin.plans.destroy(id)
    return { ok: true, plan: toSubscriptionPlan(unwrapPlan(data)), messageKey: 'toast.archived' }
  } catch (error) {
    if (isNotFound(error)) {
      return { ok: false, reason: 'not_found', messageKey: 'errors.notFound' }
    }
    throw error
  }
}
