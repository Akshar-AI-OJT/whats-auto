import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

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

type Db = typeof db | TransactionClientContract

/**
 * Catalog reads for SaaS plans (not tenant-scoped).
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
}
