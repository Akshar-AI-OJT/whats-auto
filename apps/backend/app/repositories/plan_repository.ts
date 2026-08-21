import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { PlanStatus } from '#types/plans'
import { derivePlanStatus } from '#transformers/plan_transformer'

export type PlanRow = {
  id: string
  code: string
  name: string
  description: string | null
  price: string | number
  currency: string
  billingInterval: string
  billingIntervalCount: number
  trialDays: number
  gateway: string | null
  gatewayPlanId: string | null
  limits: Record<string, unknown>
  isActive: boolean
  sortOrder: number
  metadata: Record<string, unknown>
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type InsertPlanParams = {
  code: string
  name: string
  description: string | null
  price: number
  currency: string
  billingInterval: string
  billingIntervalCount: number
  trialDays: number
  gateway: string | null
  gatewayPlanId: string | null
  limits: Record<string, unknown>
  isActive: boolean
  sortOrder: number
  metadata: Record<string, unknown>
}

export type UpdatePlanParams = Partial<InsertPlanParams>

type Db = typeof db | TransactionClientContract

/**
 * Catalog reads/writes for SaaS plans (not tenant-scoped).
 */
export class PlanRepository {
  async findById(planId: string, client: Db = db): Promise<PlanRow | null> {
    const row = await client.from('plans').where('id', planId).first()
    return (row as PlanRow | undefined) ?? null
  }

  async findByCode(code: string, client: Db = db): Promise<PlanRow | null> {
    const row = await client.from('plans').where('code', code).first()
    return (row as PlanRow | undefined) ?? null
  }

  /**
   * Checkout acceptance SQL — keep in lockstep with `isPlanCheckoutable`
   * in the plan transformer (isActive + razorpay + gatewayPlanId).
   */
  async findActiveCheckoutableById(planId: string, client: Db = db): Promise<PlanRow | null> {
    const row = await client
      .from('plans')
      .where('id', planId)
      .where('isActive', true)
      .where('gateway', 'razorpay')
      .whereNotNull('gatewayPlanId')
      .first()
    return (row as PlanRow | undefined) ?? null
  }

  async listAll(client: Db = db): Promise<PlanRow[]> {
    const rows = await client.from('plans').orderBy('sortOrder', 'asc').orderBy('name', 'asc')
    return rows as PlanRow[]
  }

  async create(params: InsertPlanParams, client: Db = db): Promise<PlanRow> {
    const [row] = await client.table('plans').insert(params).returning('*')
    return row as PlanRow
  }

  async update(planId: string, params: UpdatePlanParams, client: Db = db): Promise<PlanRow | null> {
    const [row] = await client.from('plans').where('id', planId).update(params).returning('*')
    return (row as PlanRow | undefined) ?? null
  }

  /**
   * Filter in memory so status (stored partly in metadata) stays consistent with the transformer.
   */
  filterRows(rows: PlanRow[], params: { search?: string; status?: PlanStatus | 'all' }): PlanRow[] {
    const status = params.status ?? 'all'
    const search = params.search?.trim().toLowerCase() ?? ''

    return rows.filter((row) => {
      const derived = derivePlanStatus(row)
      if (status !== 'all' && derived !== status) return false
      if (!search) return true
      return (
        row.name.toLowerCase().includes(search) ||
        (row.description ?? '').toLowerCase().includes(search) ||
        row.code.toLowerCase().includes(search) ||
        derived.toLowerCase().includes(search)
      )
    })
  }
}
