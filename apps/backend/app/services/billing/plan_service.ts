import PlanException from '#exceptions/plan_exception'
import { createRazorpayClient, RazorpayApiError } from '#lib/razorpay/razorpay_client'
import type { RazorpayClient, RazorpayPlanPeriod } from '#lib/razorpay/types'
import { PlanRepository } from '#repositories/plan_repository'
import {
  buildPlanSummary,
  deriveBillingPeriod,
  derivePlanStatus,
  transformPlan,
} from '#transformers/plan_transformer'
import type {
  CreateSuperAdminPlanInput,
  PlanBillingPeriod,
  PlanFeature,
  PlanStatus,
  SuperAdminPlan,
  SuperAdminPlanSummary,
  UpdateSuperAdminPlanInput,
} from '#types/plans'

type PersistedLimits = {
  users: number | null
  seats: number | null
  messagesPerMonth: number | null
  workspaces: number | null
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

function billingIntervalFromPeriod(period: PlanBillingPeriod): string {
  if (period === 'yearly') return 'year'
  if (period === 'custom') return 'custom'
  return 'month'
}

function razorpayPeriodFromBilling(period: PlanBillingPeriod): RazorpayPlanPeriod | null {
  if (period === 'monthly') return 'monthly'
  if (period === 'yearly') return 'yearly'
  return null
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
    workspaces: input?.workspaces ?? null,
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

function isCheckoutSyncable(price: number, billingPeriod: PlanBillingPeriod): boolean {
  return price > 0 && (billingPeriod === 'monthly' || billingPeriod === 'yearly')
}

/**
 * Super-admin SaaS plan catalog: CRUD + Razorpay Plans API sync for gatewayPlanId.
 */
export class PlanService {
  protected razorpay: RazorpayClient

  constructor(
    protected plans: PlanRepository = new PlanRepository(),
    razorpayClient?: RazorpayClient
  ) {
    this.razorpay = razorpayClient ?? createRazorpayClient()
  }

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

  async getPlan(planId: string): Promise<SuperAdminPlan> {
    const row = await this.plans.findById(planId)
    if (!row) throw PlanException.notFound()
    return transformPlan(row)
  }

  async createPlan(input: CreateSuperAdminPlanInput): Promise<SuperAdminPlan> {
    const billingPeriod = input.billingPeriod
    const customPricing = input.price === null || billingPeriod === 'custom'
    const price = customPricing ? 0 : Number(input.price)
    const status = input.status
    const code = await this.#allocateCode(input.code?.trim() || slugifyCode(input.name))

    let gateway: string | null = null
    let gatewayPlanId: string | null = null

    if (isCheckoutSyncable(price, billingPeriod)) {
      const synced = await this.#createRazorpayPlan({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        price,
        currency: input.currency.toUpperCase(),
        billingPeriod,
        code,
      })
      gateway = 'razorpay'
      gatewayPlanId = synced.id
    }

    const row = await this.plans.create({
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price,
      currency: input.currency.toUpperCase(),
      billingInterval: billingIntervalFromPeriod(billingPeriod),
      billingIntervalCount: 1,
      trialDays: input.trialDays ?? 0,
      gateway,
      gatewayPlanId,
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

    return transformPlan(row)
  }

  async updatePlan(planId: string, patch: UpdateSuperAdminPlanInput): Promise<SuperAdminPlan> {
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

    const priceChanged =
      toMajorPrice(existing.price) !== price ||
      deriveBillingPeriod(existing) !== billingPeriod ||
      existing.currency.toUpperCase() !== currency

    let gateway = existing.gateway
    let gatewayPlanId = existing.gatewayPlanId

    if (isCheckoutSyncable(price, billingPeriod) && (priceChanged || !gatewayPlanId)) {
      const synced = await this.#createRazorpayPlan({
        name,
        description,
        price,
        currency,
        billingPeriod,
        code,
      })
      gateway = 'razorpay'
      gatewayPlanId = synced.id
    } else if (!isCheckoutSyncable(price, billingPeriod)) {
      gateway = null
      gatewayPlanId = null
    }

    const updated = await this.plans.update(planId, {
      code,
      name,
      description,
      price,
      currency,
      billingInterval: billingIntervalFromPeriod(billingPeriod),
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
    return transformPlan(updated)
  }

  async archivePlan(planId: string): Promise<SuperAdminPlan> {
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
    return transformPlan(updated)
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

  async #createRazorpayPlan(params: {
    name: string
    description: string | null
    price: number
    currency: string
    billingPeriod: PlanBillingPeriod
    code: string
  }) {
    const period = razorpayPeriodFromBilling(params.billingPeriod)
    if (!period) {
      throw PlanException.gatewayFailed('Billing period is not syncable with Razorpay')
    }

    try {
      return await this.razorpay.createPlan({
        period,
        interval: 1,
        item: {
          name: params.name,
          amount: Math.round(params.price * 100),
          currency: params.currency,
          description: params.description,
        },
        notes: {
          planCode: params.code,
        },
      })
    } catch (error) {
      if (error instanceof RazorpayApiError) {
        throw PlanException.gatewayFailed(error.message)
      }
      throw error
    }
  }
}
