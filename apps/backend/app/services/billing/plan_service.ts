import PlanException from '#exceptions/plan_exception'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import { PlanRepository } from '#repositories/plan_repository'
import {
  PLAN_ACTIVE_LOGICAL_IDENTITY_INDEX,
  billingPeriodToInterval,
  deduplicateActivePlanRows,
  planLogicalIdentityFromValues,
} from '#lib/billing/plan_logical_identity'
import { isPostgresUniqueViolation } from '#lib/pg_unique_violation'
import {
  buildPlanSummary,
  deriveBillingPeriod,
  derivePlanStatus,
  transformPlan,
  transformTenantBillingPlan,
} from '#transformers/plan_transformer'
import type {
  CreateSuperAdminPlanInput,
  PlanBillingPeriod,
  PlanFeature,
  PlanStatus,
  SuperAdminPlan,
  SuperAdminPlanSummary,
  TenantBillingPlan,
  UpdateSuperAdminPlanInput,
} from '#types/plans'

type PersistedLimits = {
  users: number | null
  seats: number | null
  messagesPerMonth: number | null
}

type PlanMetadata = {
  status: PlanStatus
  popular: boolean
  customPricing: boolean
  billingPeriod: PlanBillingPeriod
  features: PlanFeature[]
}

function slugifyCode(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
  return slug || 'plan'
}

function toMajorPrice(value: string | number | null | undefined): number {
  if (value === null) return 0
  return typeof value === 'number' ? value : Number(value)
}

function readMetadata(row: { metadata: Record<string, unknown> }): Partial<PlanMetadata> {
  const meta = row.metadata
  if (!meta || typeof meta !== 'object') return {}
  return meta as Partial<PlanMetadata>
}

function buildLimits(input: CreateSuperAdminPlanInput['limits'] | undefined): PersistedLimits {
  const users = input?.users ?? null
  return {
    users,
    seats: users,
    messagesPerMonth: input?.messagesPerMonth ?? null,
  }
}

function buildMetadata(input: {
  status: PlanStatus
  popular: boolean
  customPricing: boolean
  billingPeriod: PlanBillingPeriod
  features: PlanFeature[]
}): PlanMetadata {
  return {
    status: input.status,
    popular: input.popular,
    customPricing: input.customPricing,
    billingPeriod: input.billingPeriod,
    features: input.features.map((feature) => ({
      key: feature.key,
      name: feature.name || feature.key,
      enabled: Boolean(feature.enabled),
      description: feature.description,
      category: feature.category,
    })),
  }
}

/**
 * Super-admin SaaS plan catalog: local CRUD only.
 * Razorpay plan sync happens lazily at tenant checkout.
 */
export class PlanService {
  constructor(protected plans: PlanRepository = new PlanRepository()) {}

  async listPlans(params: {
    search?: string
    status?: PlanStatus | 'all'
  }): Promise<{ items: SuperAdminPlan[]; summary: SuperAdminPlanSummary }> {
    const all = await this.plans.listAll()
    const filtered = this.plans.filterRows(all, params)
    return {
      items: filtered.map(transformPlan),
      summary: buildPlanSummary(all),
    }
  }

  /**
   * Tenant billing catalog: active plans only, ordered like `listAll`
   * (sortOrder ASC, name ASC). Uses the same active semantics as super-admin
   * list filtering (`derivePlanStatus` via `filterRows`).
   * Equivalent active SKUs (legacy duplicates) collapse to one canonical row.
   */
  async listTenantPlans(): Promise<{ items: TenantBillingPlan[] }> {
    const all = await this.plans.listAll()
    const active = this.plans.filterRows(all, { status: 'active' }).filter((row) => row.isActive)
    const unique = deduplicateActivePlanRows(active)
    return {
      items: unique.map(transformTenantBillingPlan),
    }
  }

  async getPlan(planId: string): Promise<SuperAdminPlan> {
    const row = await this.plans.findById(planId)
    if (!row) throw PlanException.notFound()
    return transformPlan(row)
  }

  async createPlan(
    input: CreateSuperAdminPlanInput,
    actorUserId?: string | null
  ): Promise<SuperAdminPlan> {
    const billingPeriod = input.billingPeriod
    const customPricing = input.price === null || billingPeriod === 'custom'
    const price = customPricing ? 0 : Number(input.price)
    const status = input.status
    const identity = planLogicalIdentityFromValues({
      name: input.name,
      billingInterval: billingPeriodToInterval(billingPeriod),
      billingIntervalCount: 1,
      price,
      currency: input.currency,
    })

    const reusable = await this.#findReusableLogicalPlan(identity)
    if (reusable) {
      if (derivePlanStatus(reusable) === 'active') {
        throw PlanException.duplicateActive()
      }
      return this.updatePlan(
        reusable.id,
        {
          name: input.name.trim(),
          description: input.description?.trim() || null,
          code: input.code?.trim() || reusable.code,
          price: input.price,
          currency: input.currency,
          billingPeriod,
          status,
          popular: input.popular,
          trialDays: input.trialDays,
          limits: input.limits,
          features: input.features,
          sortOrder: input.sortOrder,
        },
        actorUserId
      )
    }

    const code = await this.#allocateCode(input.code?.trim() || slugifyCode(input.name))

    try {
      const row = await this.plans.create({
        code,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        price,
        currency: input.currency.toUpperCase(),
        billingInterval: billingPeriodToInterval(billingPeriod),
        billingIntervalCount: 1,
        trialDays: input.trialDays ?? 0,
        gateway: null,
        gatewayPlanId: null,
        limits: buildLimits(input.limits),
        isActive: status === 'active',
        sortOrder: input.sortOrder ?? 0,
        metadata: buildMetadata({
          status,
          popular: Boolean(input.popular),
          customPricing,
          billingPeriod,
          features: input.features ?? [],
        }),
      })

      const plan = transformPlan(row)
      await insertAuthorizationAudit({
        organizationId: null,
        actorUserId: actorUserId ?? null,
        targetType: 'plan',
        targetId: plan.id,
        eventType: 'plan.created',
        after: { name: plan.name, status: plan.status, code: plan.code },
      })
      return plan
    } catch (error) {
      return this.#rethrowDuplicateIdentity(error)
    }
  }

  async updatePlan(
    planId: string,
    patch: UpdateSuperAdminPlanInput,
    actorUserId?: string | null
  ): Promise<SuperAdminPlan> {
    const existing = await this.plans.findById(planId)
    if (!existing) throw PlanException.notFound()

    const existingMeta = readMetadata(existing)
    const currentStatus = derivePlanStatus(existing)
    const billingPeriod = patch.billingPeriod ?? deriveBillingPeriod(existing)

    let resolvedCustomPricing: boolean
    let price: number
    if (billingPeriod === 'custom') {
      resolvedCustomPricing = true
      price = 0
    } else if (patch.price !== undefined) {
      resolvedCustomPricing = patch.price === null
      price = resolvedCustomPricing ? 0 : Number(patch.price)
    } else {
      resolvedCustomPricing = Boolean(existingMeta.customPricing)
      price = resolvedCustomPricing ? 0 : toMajorPrice(existing.price)
    }

    const status: PlanStatus =
      patch.status ?? (currentStatus === 'archived' ? 'archived' : currentStatus)

    const currency = (patch.currency ?? existing.currency).toUpperCase()
    const name = patch.name?.trim() ?? existing.name
    const description =
      patch.description !== undefined ? patch.description?.trim() || null : existing.description
    const trialDays = patch.trialDays !== undefined ? (patch.trialDays ?? 0) : existing.trialDays
    const popular =
      patch.popular !== undefined ? Boolean(patch.popular) : Boolean(existingMeta.popular)
    const features = patch.features ?? existingMeta.features ?? []
    const limits =
      patch.limits !== undefined ? buildLimits(patch.limits) : (existing.limits as PersistedLimits)

    let code = existing.code
    if (patch.code !== undefined && patch.code.trim() !== existing.code) {
      code = await this.#allocateCode(patch.code.trim(), planId)
    }

    // Clear legacy Razorpay plan ids when pricing/interval changes (Orders API ignores them).
    const priceChanged =
      toMajorPrice(existing.price) !== price ||
      deriveBillingPeriod(existing) !== billingPeriod ||
      existing.currency.toUpperCase() !== currency

    const gateway = priceChanged ? null : existing.gateway
    const gatewayPlanId = priceChanged ? null : existing.gatewayPlanId

    if (status === 'active') {
      await this.#assertNoActiveLogicalDuplicate({
        name,
        billingInterval: billingPeriodToInterval(billingPeriod),
        billingIntervalCount: existing.billingIntervalCount || 1,
        price,
        currency,
        excludeId: planId,
      })
    }

    try {
      const updated = await this.plans.update(planId, {
        code,
        name,
        description,
        price,
        currency,
        billingInterval: billingPeriodToInterval(billingPeriod),
        billingIntervalCount: existing.billingIntervalCount || 1,
        trialDays,
        gateway,
        gatewayPlanId,
        limits,
        isActive: status === 'active',
        sortOrder: patch.sortOrder ?? existing.sortOrder,
        metadata: buildMetadata({
          status,
          popular,
          customPricing: resolvedCustomPricing,
          billingPeriod,
          features,
        }),
      })

      if (!updated) throw PlanException.notFound()
      const plan = transformPlan(updated)
      await insertAuthorizationAudit({
        organizationId: null,
        actorUserId: actorUserId ?? null,
        targetType: 'plan',
        targetId: plan.id,
        eventType: 'plan.updated',
        after: { name: plan.name, status: plan.status, code: plan.code },
      })
      return plan
    } catch (error) {
      return this.#rethrowDuplicateIdentity(error)
    }
  }

  async archivePlan(planId: string, actorUserId?: string | null): Promise<SuperAdminPlan> {
    const existing = await this.plans.findById(planId)
    if (!existing) throw PlanException.notFound()

    if (derivePlanStatus(existing) === 'archived') {
      throw PlanException.alreadyArchived()
    }

    const meta = {
      ...readMetadata(existing),
      status: 'archived' as const,
      popular: false,
    }

    const updated = await this.plans.update(planId, {
      isActive: false,
      metadata: meta,
    })

    if (!updated) throw PlanException.notFound()
    const plan = transformPlan(updated)
    await insertAuthorizationAudit({
      organizationId: null,
      actorUserId: actorUserId ?? null,
      targetType: 'plan',
      targetId: plan.id,
      eventType: 'plan.updated',
      after: { name: plan.name, status: plan.status },
    })
    return plan
  }

  async #allocateCode(desired: string, excludeId?: string): Promise<string> {
    const base = slugifyCode(desired).slice(0, 56)
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = attempt === 0 ? base : `${base}_${attempt + 1}`
      const existing = await this.plans.findByCode(candidate)
      if (!existing || existing.id === excludeId) return candidate
    }
    throw PlanException.codeTaken(base)
  }

  async #findReusableLogicalPlan(identity: {
    name: string
    billingInterval: string
    billingIntervalCount: number
    price: number
    currency: string
  }) {
    const matches = await this.plans.findByLogicalIdentity(identity)
    if (matches.length === 0) return null
    const active = matches.filter((row) => derivePlanStatus(row) === 'active')
    if (active.length > 0) return active[0]
    const drafts = matches.filter((row) => derivePlanStatus(row) === 'draft')
    if (drafts.length > 0) return drafts[0]
    return matches[0]
  }

  async #assertNoActiveLogicalDuplicate(params: {
    name: string
    billingInterval: string
    billingIntervalCount: number
    price: number
    currency: string
    excludeId: string
  }) {
    const matches = await this.plans.findByLogicalIdentity(
      planLogicalIdentityFromValues(params),
      params.excludeId
    )
    if (matches.some((row) => derivePlanStatus(row) === 'active' && row.isActive)) {
      throw PlanException.duplicateActive()
    }
  }

  #rethrowDuplicateIdentity(error: unknown): never {
    if (isPostgresUniqueViolation(error, PLAN_ACTIVE_LOGICAL_IDENTITY_INDEX)) {
      throw PlanException.duplicateActive()
    }
    throw error
  }
}
