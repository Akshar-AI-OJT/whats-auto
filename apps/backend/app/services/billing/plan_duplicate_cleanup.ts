import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { PlanRow } from '#repositories/plan_repository'
import {
  PLAN_LOGICAL_IDENTITY_EXPRESSIONS_SQL,
  pickCanonicalPlanRow,
  planLogicalIdentityKey,
  type PlanReferenceCounts,
} from '#lib/billing/plan_logical_identity'

type Db = typeof db | TransactionClientContract

export type DuplicatePlanCleanupGroup = {
  identityKey: string
  canonicalId: string
  archivedIds: string[]
  subscriptionRepoints: number
  orderRepoints: number
  invoiceRepoints: number
}

export type DuplicatePlanCleanupResult = {
  groups: DuplicatePlanCleanupGroup[]
}

type DuplicateIdentityGroupRow = {
  ids: unknown
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as Record<string, unknown>) }
}

function asIdArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .replace(/^{|}$/g, '')
      .split(',')
      .map((part) => part.replaceAll('"', '').trim())
      .filter(Boolean)
  }
  return []
}

function rawRows<T>(result: unknown): T[] {
  const rows = (result as { rows?: T[] }).rows ?? result
  return Array.isArray(rows) ? rows : []
}

async function countRefs(planIds: string[], client: Db): Promise<Map<string, PlanReferenceCounts>> {
  const refs = new Map<string, PlanReferenceCounts>()
  for (const id of planIds) {
    refs.set(id, { subscriptionCount: 0, orderCount: 0, invoiceCount: 0 })
  }
  if (planIds.length === 0) return refs

  const subscriptions = (await client
    .from('organization_subscriptions')
    .whereIn('planId', planIds)
    .select('planId')) as Array<{ planId: string }>
  const orders = (await client
    .from('billing_orders')
    .whereIn('planId', planIds)
    .select('planId')) as Array<{ planId: string }>
  const invoices = (await client
    .from('invoices')
    .whereIn('planId', planIds)
    .select('planId')) as Array<{ planId: string }>

  for (const row of subscriptions as Array<{ planId: string }>) {
    const current = refs.get(row.planId)
    if (current) current.subscriptionCount += 1
  }
  for (const row of orders as Array<{ planId: string }>) {
    const current = refs.get(row.planId)
    if (current) current.orderCount += 1
  }
  for (const row of invoices as Array<{ planId: string }>) {
    const current = refs.get(row.planId)
    if (current) current.invoiceCount += 1
  }

  return refs
}

async function archivePlan(row: PlanRow, client: Db): Promise<void> {
  const metadata = asMetadata(row.metadata)
  metadata.status = 'archived'
  metadata.popular = false
  await client.from('plans').where('id', row.id).update({
    isActive: false,
    metadata,
  })
}

function isTransaction(client: Db): client is TransactionClientContract {
  return 'isTransaction' in client && (client as TransactionClientContract).isTransaction === true
}

/**
 * Identify duplicate *active* SKUs using the same expressions as the unique index.
 * Does not mutate rows — used by cleanup and for a pre-change report.
 */
export async function findDuplicateActivePlanGroups(client: Db = db): Promise<PlanRow[][]> {
  const result = await client.rawQuery(`
    SELECT array_agg("id" ORDER BY "createdAt" ASC, "id" ASC) AS ids
    FROM "plans"
    WHERE "isActive" = true
    GROUP BY ${PLAN_LOGICAL_IDENTITY_EXPRESSIONS_SQL}
    HAVING COUNT(*) > 1
  `)

  const groups: PlanRow[][] = []
  for (const group of rawRows<DuplicateIdentityGroupRow>(result)) {
    const ids = asIdArray(group.ids)
    if (ids.length < 2) continue
    const rows = (await client.from('plans').whereIn('id', ids)) as PlanRow[]
    if (rows.length < 2) continue
    groups.push(rows)
  }
  return groups
}

async function runCleanup(client: TransactionClientContract): Promise<DuplicatePlanCleanupResult> {
  await client.rawQuery('SET LOCAL row_security = off')

  const duplicateGroups = await findDuplicateActivePlanGroups(client)
  const groups: DuplicatePlanCleanupGroup[] = []

  for (const rows of duplicateGroups) {
    const refs = await countRefs(
      rows.map((row) => row.id),
      client
    )
    const canonical = pickCanonicalPlanRow(rows, refs)
    const duplicates = rows.filter((row) => row.id !== canonical.id)
    const duplicateIds = duplicates.map((row) => row.id)

    const subscriptionRepoints = await client
      .from('organization_subscriptions')
      .whereIn('planId', duplicateIds)
      .update({ planId: canonical.id })
    const orderRepoints = await client
      .from('billing_orders')
      .whereIn('planId', duplicateIds)
      .update({ planId: canonical.id })
    const invoiceRepoints = await client
      .from('invoices')
      .whereIn('planId', duplicateIds)
      .update({ planId: canonical.id })

    for (const duplicate of duplicates) {
      await archivePlan(duplicate, client)
    }

    groups.push({
      identityKey: planLogicalIdentityKey(canonical),
      canonicalId: canonical.id,
      archivedIds: duplicateIds,
      subscriptionRepoints: Number(subscriptionRepoints) || 0,
      orderRepoints: Number(orderRepoints) || 0,
      invoiceRepoints: Number(invoiceRepoints) || 0,
    })
  }

  return { groups }
}

/**
 * Collapse duplicate *active* plans that represent the same logical SKU.
 * Re-points subscriptions, billing orders, and invoices onto the canonical
 * row, then archives (does not hard-delete) the extras so history survives.
 * Invoice planName/totals stay as originally issued.
 */
export async function cleanupDuplicateActivePlans(
  client: Db = db
): Promise<DuplicatePlanCleanupResult> {
  if (isTransaction(client)) {
    return runCleanup(client)
  }
  return db.transaction((trx) => runCleanup(trx))
}
