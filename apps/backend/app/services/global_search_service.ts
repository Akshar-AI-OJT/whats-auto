import db from '@adonisjs/lucid/services/db'
import { PERMISSIONS, type Permission } from '#abilities/permissions'
import { CAMPAIGN_SOFT_DELETED_STATUS } from '#validators/campaign'
import { SUBSCRIPTION_SOFT_DELETED_STATUS } from '#validators/subscription_crud'

export const GLOBAL_SEARCH_PER_TYPE_LIMIT = 8

export type GlobalSearchResultType =
  | 'contact'
  | 'conversation'
  | 'campaign'
  | 'template'
  | 'flow'
  | 'customer_group'
  | 'organization'
  | 'user'
  | 'plan'
  | 'subscription'
  | 'invoice'

export type GlobalSearchResult = {
  type: GlobalSearchResultType
  id: string
  title: string
  description: string | null
}

export type GlobalSearchResponse = {
  query: string
  results: GlobalSearchResult[]
}

function escapeIlike(value: string): string {
  return `%${value.replace(/[%_\\]/g, '\\$&')}%`
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function hasPermission(
  permissions: ReadonlySet<Permission> | undefined,
  ...keys: Permission[]
): boolean {
  if (!permissions || permissions.size === 0) return false
  return keys.some((key) => permissions.has(key))
}

function mapRows(
  type: GlobalSearchResultType,
  rows: Record<string, unknown>[],
  map: (row: Record<string, unknown>) => { title: string; description: string | null }
): GlobalSearchResult[] {
  const results: GlobalSearchResult[] = []
  for (const row of rows) {
    const id = asText(row.id)
    if (!id) continue
    const mapped = map(row)
    results.push({
      type,
      id,
      title: mapped.title,
      description: mapped.description,
    })
  }
  return results
}

/**
 * Permission-aware global search. Tenant searches always filter by the
 * authenticated organization id (never a client-supplied org). Platform
 * searches only include types the Super Admin is authorized to view.
 */
export class GlobalSearchService {
  async searchOrganization(input: {
    query: string
    organizationId: string
    permissions?: ReadonlySet<Permission>
  }): Promise<GlobalSearchResponse> {
    const query = input.query.trim()
    const pattern = escapeIlike(query)
    const organizationId = input.organizationId
    const permissions = input.permissions
    const limit = GLOBAL_SEARCH_PER_TYPE_LIMIT

    const tasks: Array<Promise<GlobalSearchResult[]>> = []

    if (hasPermission(permissions, PERMISSIONS.CONTACTS_VIEW)) {
      tasks.push(this.searchContacts(organizationId, pattern, query, limit))
      tasks.push(this.searchCustomerGroups(organizationId, pattern, limit))
    }

    if (hasPermission(permissions, PERMISSIONS.INBOX_VIEW)) {
      tasks.push(this.searchConversations(organizationId, pattern, query, limit))
    }

    if (hasPermission(permissions, PERMISSIONS.CAMPAIGNS_VIEW)) {
      tasks.push(this.searchCampaigns(organizationId, pattern, limit))
    }

    if (
      hasPermission(
        permissions,
        PERMISSIONS.TEMPLATES_VIEW,
        PERMISSIONS.WHATSAPP_VIEW,
        PERMISSIONS.WHATSAPP_MANAGE
      )
    ) {
      tasks.push(this.searchTemplates(organizationId, pattern, limit))
    }

    if (hasPermission(permissions, PERMISSIONS.AUTOMATIONS_VIEW)) {
      tasks.push(this.searchFlows(organizationId, pattern, limit))
    }

    const groups = await Promise.all(tasks)
    return { query, results: groups.flat() }
  }

  async searchPlatform(input: {
    query: string
    permissions?: ReadonlySet<Permission>
  }): Promise<GlobalSearchResponse> {
    const query = input.query.trim()
    const pattern = escapeIlike(query)
    const permissions = input.permissions
    const limit = GLOBAL_SEARCH_PER_TYPE_LIMIT

    const tasks: Array<Promise<GlobalSearchResult[]>> = []

    if (hasPermission(permissions, PERMISSIONS.PLATFORM_TENANTS_VIEW)) {
      tasks.push(this.searchOrganizations(pattern, limit))
      tasks.push(this.searchUsers(pattern, limit))
    }

    if (hasPermission(permissions, PERMISSIONS.PLATFORM_TENANTS_BILLING)) {
      tasks.push(this.searchPlans(pattern, limit))
      tasks.push(this.searchSubscriptions(pattern, limit))
      tasks.push(this.searchInvoices(pattern, limit))
    }

    const groups = await Promise.all(tasks)
    return { query, results: groups.flat() }
  }

  private async searchContacts(
    organizationId: string,
    pattern: string,
    rawQuery: string,
    limit: number
  ): Promise<GlobalSearchResult[]> {
    const digits = rawQuery.replace(/\D/g, '')
    const rows = await db
      .from('contacts')
      .where('organizationId', organizationId)
      .whereNull('deletedAt')
      .where((builder) => {
        builder
          .whereILike('name', pattern)
          .orWhereILike('email', pattern)
          .orWhereILike('phone', pattern)
          .orWhereILike('company', pattern)
        if (digits) {
          builder.orWhereILike('phoneNormalized', `%${digits}%`)
        }
      })
      .select('id', 'name', 'phone', 'email', 'company')
      .orderBy('createdAt', 'desc')
      .limit(limit)

    return mapRows('contact', rows, (row) => ({
      title: asText(row.name) ?? asText(row.phone) ?? 'Contact',
      description: asText(row.company) ?? asText(row.email) ?? asText(row.phone),
    }))
  }

  private async searchConversations(
    organizationId: string,
    pattern: string,
    rawQuery: string,
    limit: number
  ): Promise<GlobalSearchResult[]> {
    const digits = rawQuery.replace(/\D/g, '')
    const rows = await db
      .from('conversations as c')
      .innerJoin('contacts as ct', 'ct.id', 'c.contactId')
      .where('c.organizationId', organizationId)
      .whereNull('ct.deletedAt')
      .where((builder) => {
        builder
          .whereILike('ct.name', pattern)
          .orWhereILike('ct.phone', pattern)
          .orWhereILike('c.lastMessageText', pattern)
        if (digits) {
          builder.orWhereILike('ct.phoneNormalized', `%${digits}%`)
        }
      })
      .select(
        'c.id as id',
        'ct.name as contactName',
        'ct.phone as phone',
        'c.lastMessageText',
        'c.status'
      )
      .orderBy('c.lastMessageAt', 'desc')
      .limit(limit)

    return mapRows('conversation', rows, (row) => ({
      title: asText(row.contactName) ?? asText(row.phone) ?? 'Conversation',
      description: asText(row.lastMessageText) ?? asText(row.status),
    }))
  }

  private async searchCampaigns(
    organizationId: string,
    pattern: string,
    limit: number
  ): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('broadcasts')
      .where('organizationId', organizationId)
      .whereNot('status', CAMPAIGN_SOFT_DELETED_STATUS)
      .whereILike('name', pattern)
      .select('id', 'name', 'status')
      .orderBy('createdAt', 'desc')
      .limit(limit)

    return mapRows('campaign', rows, (row) => ({
      title: asText(row.name) ?? 'Campaign',
      description: asText(row.status),
    }))
  }

  private async searchTemplates(
    organizationId: string,
    pattern: string,
    limit: number
  ): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('message_templates')
      .where('organizationId', organizationId)
      .whereNot('status', 'deleted')
      .where((builder) => {
        builder.whereILike('name', pattern).orWhereILike('bodyText', pattern)
      })
      .select('id', 'name', 'category', 'status')
      .orderBy('createdAt', 'desc')
      .limit(limit)

    return mapRows('template', rows, (row) => ({
      title: asText(row.name) ?? 'Template',
      description: [asText(row.category), asText(row.status)].filter(Boolean).join(' · ') || null,
    }))
  }

  private async searchFlows(
    organizationId: string,
    pattern: string,
    limit: number
  ): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('flows')
      .where('organizationId', organizationId)
      .where((builder) => {
        builder.whereILike('name', pattern).orWhereILike('description', pattern)
      })
      .select('id', 'name', 'description', 'status')
      .orderBy('updatedAt', 'desc')
      .limit(limit)

    return mapRows('flow', rows, (row) => ({
      title: asText(row.name) ?? 'Flow',
      description: asText(row.description) ?? asText(row.status),
    }))
  }

  private async searchCustomerGroups(
    organizationId: string,
    pattern: string,
    limit: number
  ): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('tags')
      .where('organizationId', organizationId)
      .where((builder) => {
        builder.whereILike('name', pattern).orWhereILike('description', pattern)
      })
      .select('id', 'name', 'description', 'status')
      .orderBy('createdAt', 'desc')
      .limit(limit)

    return mapRows('customer_group', rows, (row) => ({
      title: asText(row.name) ?? 'Customer group',
      description: asText(row.description) ?? asText(row.status),
    }))
  }

  private async searchOrganizations(pattern: string, limit: number): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('organizations')
      .whereNull('deletedAt')
      .where((builder) => {
        builder
          .whereILike('name', pattern)
          .orWhereILike('slug', pattern)
          .orWhereILike('email', pattern)
      })
      .select('id', 'name', 'slug', 'email')
      .orderBy('name', 'asc')
      .limit(limit)

    return mapRows('organization', rows, (row) => ({
      title: asText(row.name) ?? 'Organization',
      description: asText(row.slug) ?? asText(row.email),
    }))
  }

  private async searchUsers(pattern: string, limit: number): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('users')
      .where('isDeleted', false)
      .where((builder) => {
        builder
          .whereILike('name', pattern)
          .orWhereILike('email', pattern)
          .orWhereILike('firstname', pattern)
          .orWhereILike('lastname', pattern)
      })
      .select('id', 'name', 'email')
      .orderBy('createdAt', 'desc')
      .limit(limit)

    return mapRows('user', rows, (row) => ({
      title: asText(row.name) ?? asText(row.email) ?? 'User',
      description: asText(row.email),
    }))
  }

  private async searchPlans(pattern: string, limit: number): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('plans')
      .where((builder) => {
        builder
          .whereILike('name', pattern)
          .orWhereILike('code', pattern)
          .orWhereILike('description', pattern)
      })
      .select('id', 'name', 'code', 'billingInterval', 'currency')
      .orderBy('sortOrder', 'asc')
      .limit(limit)

    return mapRows('plan', rows, (row) => ({
      title: asText(row.name) ?? 'Plan',
      description:
        [asText(row.code), asText(row.billingInterval), asText(row.currency)]
          .filter(Boolean)
          .join(' · ') || null,
    }))
  }

  private async searchSubscriptions(pattern: string, limit: number): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('organization_subscriptions as s')
      .innerJoin('organizations as o', 'o.id', 's.organizationId')
      .innerJoin('plans as p', 'p.id', 's.planId')
      .whereNot('s.status', SUBSCRIPTION_SOFT_DELETED_STATUS)
      .where((builder) => {
        builder
          .whereILike('o.name', pattern)
          .orWhereILike('o.slug', pattern)
          .orWhereILike('p.name', pattern)
          .orWhereILike('s.status', pattern)
      })
      .select('s.id as id', 'o.name as organizationName', 'p.name as planName', 's.status')
      .orderBy('s.createdAt', 'desc')
      .limit(limit)

    return mapRows('subscription', rows, (row) => ({
      title: asText(row.organizationName) ?? 'Subscription',
      description: [asText(row.planName), asText(row.status)].filter(Boolean).join(' · ') || null,
    }))
  }

  private async searchInvoices(pattern: string, limit: number): Promise<GlobalSearchResult[]> {
    const rows = await db
      .from('invoices')
      .where((builder) => {
        builder
          .whereILike('invoiceNumber', pattern)
          .orWhereILike('billToName', pattern)
          .orWhereILike('billToEmail', pattern)
          .orWhereILike('planName', pattern)
      })
      .select('id', 'invoiceNumber', 'billToName', 'planName', 'status')
      .orderBy('issueDate', 'desc')
      .limit(limit)

    return mapRows('invoice', rows, (row) => ({
      title: asText(row.invoiceNumber) ?? 'Invoice',
      description:
        [asText(row.billToName), asText(row.planName), asText(row.status)]
          .filter(Boolean)
          .join(' · ') || null,
    }))
  }
}
