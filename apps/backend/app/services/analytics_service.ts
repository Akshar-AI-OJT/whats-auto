import db from '@adonisjs/lucid/services/db'
import { OrganizationStatus } from '#enums/organization_status'
import { CAMPAIGN_SOFT_DELETED_STATUS } from '#validators/campaign'
import { SUBSCRIPTION_SOFT_DELETED_STATUS } from '#validators/subscription_crud'

export type AnalyticsBreakdownItem = {
  key: string
  label: string
  value: number
}

export type AnalyticsMonthPoint = {
  key: string
  value: number
}

export type AnalyticsGrowthPoint = {
  key: string
  created: number
  cumulative: number
}

export type TenantAnalyticsSummary = {
  totalContacts: number
  contactGrowth: AnalyticsMonthPoint[]
  totalCampaigns: number
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  readCount: number
  repliedCount: number
  failedCount: number
  deliveryRate: number
  campaignStatusBreakdown: AnalyticsBreakdownItem[]
  totalConversations: number
  unreadMessages: number
  conversationStatusBreakdown: AnalyticsBreakdownItem[]
  connectedWhatsappNumbers: number
  whatsappStatusBreakdown: AnalyticsBreakdownItem[]
  totalTemplates: number
  templateStatusBreakdown: AnalyticsBreakdownItem[]
  templateCategoryBreakdown: AnalyticsBreakdownItem[]
  templateUsage: AnalyticsBreakdownItem[]
  totalGroups: number
  topGroups: Array<{ id: string; name: string; contactCount: number }>
}

export type PlatformAnalyticsSummary = {
  totalOrganizations: number
  activeOrganizations: number
  inactiveOrganizations: number
  trialOrganizations: number
  organizationGrowth: AnalyticsGrowthPoint[]
  activeInactive: AnalyticsBreakdownItem[]
  planDistribution: AnalyticsBreakdownItem[]
}

function ratePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

function asCount(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function monthKeys(months: number, now = new Date()): string[] {
  const keys: string[] = []
  for (let index = months - 1; index >= 0; index--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

function firstMonthStartUtc(months: number, now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
}

function toBreakdown(
  rows: Array<{ key?: string | null; value?: unknown }>,
  labelFn?: (key: string) => string
): AnalyticsBreakdownItem[] {
  return rows
    .map((row) => {
      const key = String(row.key || 'unknown').toLowerCase()
      return {
        key,
        label: labelFn ? labelFn(key) : key,
        value: asCount(row.value),
      }
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
}

function fillMonthSeries(
  keys: string[],
  rows: Array<{ key?: string | null; value?: unknown }>
): AnalyticsMonthPoint[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.key) continue
    counts.set(String(row.key), asCount(row.value))
  }
  return keys.map((key) => ({ key, value: counts.get(key) ?? 0 }))
}

export class AnalyticsService {
  /**
   * Tenant Analytics KPIs from SQL aggregates. Always scoped to organizationId.
   */
  async getTenantSummary(organizationId: string): Promise<TenantAnalyticsSummary> {
    const keys = monthKeys(6)
    const growthStart = firstMonthStartUtc(6)

    const [
      contactCountRow,
      contactGrowthRows,
      campaignTotals,
      campaignStatusRows,
      conversationTotals,
      conversationStatusRows,
      whatsappStatusRows,
      templateCountRow,
      templateStatusRows,
      templateCategoryRows,
      templateUsageRows,
      groupCountRow,
      topGroupRows,
    ] = await Promise.all([
      db
        .from('contacts')
        .where('organizationId', organizationId)
        .whereNull('deletedAt')
        .count('* as total')
        .first(),
      db
        .from('contacts')
        .where('organizationId', organizationId)
        .whereNull('deletedAt')
        .where('createdAt', '>=', growthStart)
        .select(
          db.raw(`to_char(date_trunc('month', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM') as key`)
        )
        .count('* as value')
        .groupByRaw(`to_char(date_trunc('month', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM')`),
      db
        .from('broadcasts')
        .where('organizationId', organizationId)
        .whereNot('status', CAMPAIGN_SOFT_DELETED_STATUS)
        .select(
          db.raw('COUNT(*)::int as "totalCampaigns"'),
          db.raw('COALESCE(SUM("totalRecipients"), 0)::int as "totalRecipients"'),
          db.raw('COALESCE(SUM("sentCount"), 0)::int as "sentCount"'),
          db.raw('COALESCE(SUM("deliveredCount"), 0)::int as "deliveredCount"'),
          db.raw('COALESCE(SUM("readCount"), 0)::int as "readCount"'),
          db.raw('COALESCE(SUM("repliedCount"), 0)::int as "repliedCount"'),
          db.raw('COALESCE(SUM("failedCount"), 0)::int as "failedCount"')
        )
        .first(),
      db
        .from('broadcasts')
        .where('organizationId', organizationId)
        .whereNot('status', CAMPAIGN_SOFT_DELETED_STATUS)
        .select('status as key')
        .count('* as value')
        .groupBy('status'),
      db
        .from('conversations as c')
        .innerJoin('contacts as ct', 'ct.id', 'c.contactId')
        .where('c.organizationId', organizationId)
        .whereNull('ct.deletedAt')
        .select(
          db.raw('COUNT(*)::int as total'),
          db.raw('COALESCE(SUM(c."unreadCount"), 0)::int as unread')
        )
        .first(),
      db
        .from('conversations as c')
        .innerJoin('contacts as ct', 'ct.id', 'c.contactId')
        .where('c.organizationId', organizationId)
        .whereNull('ct.deletedAt')
        .select('c.status as key')
        .count('* as value')
        .groupBy('c.status'),
      db
        .from('whatsapp_configs')
        .where('organizationId', organizationId)
        .select('status as key')
        .count('* as value')
        .groupBy('status'),
      db
        .from('message_templates')
        .where('organizationId', organizationId)
        .count('* as total')
        .first(),
      db
        .from('message_templates')
        .where('organizationId', organizationId)
        .select('status as key')
        .count('* as value')
        .groupBy('status'),
      db
        .from('message_templates')
        .where('organizationId', organizationId)
        .select('category as key')
        .count('* as value')
        .groupBy('category'),
      db
        .from('broadcasts as b')
        .leftJoin('message_templates as t', 't.id', 'b.messageTemplateId')
        .where('b.organizationId', organizationId)
        .whereNot('b.status', CAMPAIGN_SOFT_DELETED_STATUS)
        .whereNotNull('b.messageTemplateId')
        .select(
          'b.messageTemplateId as key',
          db.raw('COALESCE(t.name, b."messageTemplateId"::text) as label')
        )
        .count('* as value')
        .groupBy('b.messageTemplateId', 't.name')
        .orderByRaw('COUNT(*) DESC')
        .limit(5),
      db.from('tags').where('organizationId', organizationId).count('* as total').first(),
      db
        .from('tags as t')
        .where('t.organizationId', organizationId)
        .select(
          't.id as id',
          't.name as name',
          db.raw(`(
            SELECT COUNT(*)::int
            FROM contact_tags AS ct
            INNER JOIN contacts AS c ON c.id = ct."contactId"
            WHERE ct."tagId" = t.id
              AND ct."organizationId" = t."organizationId"
              AND c."deletedAt" IS NULL
          ) as "contactCount"`)
        )
        .orderBy('contactCount', 'desc')
        .orderBy('t.name', 'asc')
        .limit(5),
    ])

    const sentCount = asCount(campaignTotals?.sentCount)
    const deliveredCount = asCount(campaignTotals?.deliveredCount)
    const whatsappStatusBreakdown = toBreakdown(whatsappStatusRows)
    const connectedWhatsappNumbers =
      whatsappStatusBreakdown.find((item) => item.key === 'connected')?.value ?? 0

    return {
      totalContacts: asCount(contactCountRow?.total),
      contactGrowth: fillMonthSeries(keys, contactGrowthRows),
      totalCampaigns: asCount(campaignTotals?.totalCampaigns),
      totalRecipients: asCount(campaignTotals?.totalRecipients),
      sentCount,
      deliveredCount,
      readCount: asCount(campaignTotals?.readCount),
      repliedCount: asCount(campaignTotals?.repliedCount),
      failedCount: asCount(campaignTotals?.failedCount),
      deliveryRate: ratePercent(deliveredCount, sentCount),
      campaignStatusBreakdown: toBreakdown(campaignStatusRows),
      totalConversations: asCount(conversationTotals?.total),
      unreadMessages: asCount(conversationTotals?.unread),
      conversationStatusBreakdown: toBreakdown(conversationStatusRows),
      connectedWhatsappNumbers,
      whatsappStatusBreakdown,
      totalTemplates: asCount(templateCountRow?.total),
      templateStatusBreakdown: toBreakdown(templateStatusRows),
      templateCategoryBreakdown: toBreakdown(templateCategoryRows),
      templateUsage: templateUsageRows.map((row) => ({
        key: String(row.key),
        label: String(row.label || row.key),
        value: asCount(row.value),
      })),
      totalGroups: asCount(groupCountRow?.total),
      topGroups: topGroupRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        contactCount: asCount(row.contactCount),
      })),
    }
  }

  /**
   * Super Admin Analytics KPIs from SQL aggregates.
   * Total organizations matches the unfiltered platform org list (includes soft-deleted).
   */
  async getPlatformSummary(): Promise<PlatformAnalyticsSummary> {
    const keys = monthKeys(6)
    const growthStart = firstMonthStartUtc(6)

    const [orgCounts, growthRows, baselineRow, trialRow, planRows] = await Promise.all([
      db
        .from('organizations')
        .select(
          db.raw('COUNT(*)::int as total'),
          db.raw(
            `COUNT(*) FILTER (WHERE "deletedAt" IS NULL AND status = '${OrganizationStatus.ACTIVE}')::int as active`
          ),
          db.raw(
            `COUNT(*) FILTER (WHERE "deletedAt" IS NULL AND status IN ('${OrganizationStatus.SUSPENDED}', '${OrganizationStatus.FALSE}'))::int as inactive`
          )
        )
        .first(),
      db
        .from('organizations')
        .whereNull('deletedAt')
        .where('createdAt', '>=', growthStart)
        .select(
          db.raw(`to_char(date_trunc('month', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM') as key`)
        )
        .count('* as created')
        .groupByRaw(`to_char(date_trunc('month', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM')`),
      db
        .from('organizations')
        .whereNull('deletedAt')
        .where('createdAt', '<', growthStart)
        .count('* as total')
        .first(),
      db
        .from('organization_subscriptions')
        .where('status', 'trialing')
        .select(db.raw('COUNT(DISTINCT "organizationId")::int as total'))
        .first(),
      db
        .from('organization_subscriptions as s')
        .leftJoin('plans as p', 'p.id', 's.planId')
        .whereNot('s.status', SUBSCRIPTION_SOFT_DELETED_STATUS)
        .select('s.planId as key', db.raw('COALESCE(p.name, s."planId"::text) as label'))
        .count('* as value')
        .groupBy('s.planId', 'p.name')
        .orderByRaw('COUNT(*) DESC'),
    ])

    const createdByMonth = new Map<string, number>()
    for (const row of growthRows) {
      if (!row.key) continue
      createdByMonth.set(String(row.key), asCount(row.created))
    }

    let cumulative = asCount(baselineRow?.total)
    const organizationGrowth = keys.map((key) => {
      const created = createdByMonth.get(key) ?? 0
      cumulative += created
      return { key, created, cumulative }
    })

    const activeOrganizations = asCount(orgCounts?.active)
    const inactiveOrganizations = asCount(orgCounts?.inactive)

    return {
      totalOrganizations: asCount(orgCounts?.total),
      activeOrganizations,
      inactiveOrganizations,
      trialOrganizations: asCount(trialRow?.total),
      organizationGrowth,
      activeInactive: [
        { key: 'active', label: 'active', value: activeOrganizations },
        { key: 'inactive', label: 'inactive', value: inactiveOrganizations },
      ],
      planDistribution: planRows.map((row) => ({
        key: String(row.key),
        label: String(row.label || row.key),
        value: asCount(row.value),
      })),
    }
  }
}
