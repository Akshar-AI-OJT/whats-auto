/**
 * Temporary in-memory Customer Groups store.
 *
 * This is the only mock data source for the frontend module. Replace reads/writes
 * in `customer-group-service.ts` with `/api/v1/customer-groups` once the backend exists.
 *
 * Campaign usage and engagement are intentionally `null` — do not invent those stats here.
 */

import type { CustomerGroup, CustomerGroupStatus } from '@/lib/api'

type OrgStore = {
  groups: CustomerGroup[]
}

const stores = new Map<string, OrgStore>()

function cloneGroup(group: CustomerGroup): CustomerGroup {
  return { ...group, contactIds: [...group.contactIds] }
}

function withCount(group: Omit<CustomerGroup, 'contactCount'>): CustomerGroup {
  return { ...group, contactCount: group.contactIds.length }
}

function seedGroups(organizationId: string): CustomerGroup[] {
  const now = new Date()
  const iso = (daysAgo: number) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - daysAgo)
    return date.toISOString()
  }

  const rows: Array<{
    id: string
    name: string
    description: string
    status: CustomerGroupStatus
    daysAgo: number
  }> = [
    {
      id: `${organizationId}-group-vip`,
      name: 'VIP Customers',
      description: 'High-value customers for exclusive offers.',
      status: 'active',
      daysAgo: 90,
    },
    {
      id: `${organizationId}-group-new`,
      name: 'New Customers',
      description: 'Contacts added in the last 30 days.',
      status: 'active',
      daysAgo: 60,
    },
    {
      id: `${organizationId}-group-blocked`,
      name: 'Blacklisted',
      description: 'Contacts excluded from marketing campaigns.',
      status: 'inactive',
      daysAgo: 45,
    },
    {
      id: `${organizationId}-group-repeat`,
      name: 'Repeat Buyers',
      description: 'Customers with more than one purchase.',
      status: 'active',
      daysAgo: 21,
    },
  ]

  return rows.map((row) =>
    withCount({
      id: row.id,
      organizationId,
      name: row.name,
      description: row.description,
      type: 'static',
      status: row.status,
      contactIds: [],
      usedInCampaigns: null,
      createdAt: iso(row.daysAgo),
      updatedAt: null,
    })
  )
}

function getOrgStore(organizationId: string): OrgStore {
  let store = stores.get(organizationId)
  if (!store) {
    store = { groups: seedGroups(organizationId) }
    stores.set(organizationId, store)
  }
  return store
}

export function listStoredGroups(organizationId: string): CustomerGroup[] {
  return getOrgStore(organizationId).groups.map(cloneGroup)
}

export function getStoredGroup(
  organizationId: string,
  groupId: string
): CustomerGroup | null {
  const group = getOrgStore(organizationId).groups.find((item) => item.id === groupId)
  return group ? cloneGroup(group) : null
}

export function insertStoredGroup(
  organizationId: string,
  group: Omit<CustomerGroup, 'contactCount'>
): CustomerGroup {
  const store = getOrgStore(organizationId)
  const next = withCount(group)
  store.groups = [next, ...store.groups]
  return cloneGroup(next)
}

export function replaceStoredGroup(
  organizationId: string,
  group: CustomerGroup
): CustomerGroup {
  const store = getOrgStore(organizationId)
  const next = withCount({ ...group, contactIds: [...group.contactIds] })
  store.groups = store.groups.map((item) => (item.id === next.id ? next : item))
  return cloneGroup(next)
}

export function removeStoredGroup(organizationId: string, groupId: string): boolean {
  const store = getOrgStore(organizationId)
  const before = store.groups.length
  store.groups = store.groups.filter((item) => item.id !== groupId)
  return store.groups.length < before
}
