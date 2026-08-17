/**
 * Customer Groups data adapter.
 *
 * Future HTTP contract (do not call these endpoints until the backend exists):
 *   GET    /api/v1/customer-groups
 *   POST   /api/v1/customer-groups
 *   GET    /api/v1/customer-groups/:id
 *   PATCH  /api/v1/customer-groups/:id
 *   DELETE /api/v1/customer-groups/:id
 *   GET    /api/v1/customer-groups/:id/contacts
 *   POST   /api/v1/customer-groups/:id/contacts
 *   DELETE /api/v1/customer-groups/:id/contacts/:contactId
 *
 * Components should import this module — not the in-memory store.
 */

import type { ContactSummary } from '@/lib/api'
import type {
  CreateCustomerGroupBody,
  CustomerGroup,
  CustomerGroupSummaryStats,
  ListCustomerGroupsParams,
  UpdateCustomerGroupBody,
} from '@/lib/api'
import {
  getStoredGroup,
  insertStoredGroup,
  listStoredGroups,
  removeStoredGroup,
  replaceStoredGroup,
} from './customer-group-store'

const MOCK_LATENCY_MS = 80

export const customerGroupQueryKeys = {
  all: ['customer-groups'] as const,
  list: (organizationId: string | null | undefined) =>
    [...customerGroupQueryKeys.all, 'list', organizationId ?? 'none'] as const,
  summary: (organizationId: string | null | undefined) =>
    [...customerGroupQueryKeys.all, 'summary', organizationId ?? 'none'] as const,
  detail: (organizationId: string | null | undefined, id: string) =>
    [...customerGroupQueryKeys.all, 'detail', organizationId ?? 'none', id] as const,
}

export class CustomerGroupServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CustomerGroupServiceError'
  }
}

function delay() {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS))
}

function requireOrganizationId(organizationId: string | null | undefined): string {
  if (!organizationId) {
    throw new CustomerGroupServiceError('Organization is required.')
  }
  return organizationId
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function assertUniqueName(
  organizationId: string,
  name: string,
  excludeId?: string
) {
  const needle = name.toLowerCase()
  const clash = listStoredGroups(organizationId).some(
    (group) => group.id !== excludeId && group.name.toLowerCase() === needle
  )
  if (clash) {
    throw new CustomerGroupServiceError('A group with this name already exists.')
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))]
}

export async function listCustomerGroups(
  organizationId: string | null | undefined,
  params: ListCustomerGroupsParams = {}
): Promise<CustomerGroup[]> {
  await delay()
  const orgId = requireOrganizationId(organizationId)
  const search = params.search?.trim().toLowerCase() ?? ''
  const status = params.status ?? 'all'

  return listStoredGroups(orgId).filter((group) => {
    if (status !== 'all' && group.status !== status) return false
    if (!search) return true
    const haystack = `${group.name} ${group.description}`.toLowerCase()
    return haystack.includes(search)
  })
}

export async function getCustomerGroupSummary(
  organizationId: string | null | undefined
): Promise<CustomerGroupSummaryStats> {
  await delay()
  const orgId = requireOrganizationId(organizationId)
  const groups = listStoredGroups(orgId)
  const uniqueContacts = new Set<string>()
  for (const group of groups) {
    for (const contactId of group.contactIds) uniqueContacts.add(contactId)
  }

  return {
    totalGroups: groups.length,
    totalContacts: uniqueContacts.size,
    usedInCampaigns: null,
    engagementRate: null,
  }
}

export async function getCustomerGroup(
  organizationId: string | null | undefined,
  groupId: string
): Promise<CustomerGroup> {
  await delay()
  const orgId = requireOrganizationId(organizationId)
  const group = getStoredGroup(orgId, groupId)
  if (!group) {
    throw new CustomerGroupServiceError('Customer group not found.')
  }
  return group
}

export async function createCustomerGroup(
  organizationId: string | null | undefined,
  body: CreateCustomerGroupBody
): Promise<CustomerGroup> {
  await delay()
  const orgId = requireOrganizationId(organizationId)
  const name = normalizeName(body.name)
  if (!name) {
    throw new CustomerGroupServiceError('Group name is required.')
  }
  assertUniqueName(orgId, name)

  const now = new Date().toISOString()
  return insertStoredGroup(orgId, {
    id: crypto.randomUUID(),
    organizationId: orgId,
    name,
    description: body.description?.trim() ?? '',
    type: 'static',
    status: body.status ?? 'active',
    contactIds: uniqueIds(body.contactIds ?? []),
    usedInCampaigns: null,
    createdAt: now,
    updatedAt: now,
  })
}

export async function updateCustomerGroup(
  organizationId: string | null | undefined,
  groupId: string,
  body: UpdateCustomerGroupBody
): Promise<CustomerGroup> {
  await delay()
  const orgId = requireOrganizationId(organizationId)
  const existing = getStoredGroup(orgId, groupId)
  if (!existing) {
    throw new CustomerGroupServiceError('Customer group not found.')
  }

  const name = body.name !== undefined ? normalizeName(body.name) : existing.name
  if (!name) {
    throw new CustomerGroupServiceError('Group name is required.')
  }
  if (name !== existing.name) {
    assertUniqueName(orgId, name, groupId)
  }

  return replaceStoredGroup(orgId, {
    ...existing,
    name,
    description: body.description !== undefined ? body.description.trim() : existing.description,
    status: body.status ?? existing.status,
    contactIds: body.contactIds !== undefined ? uniqueIds(body.contactIds) : existing.contactIds,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteCustomerGroup(
  organizationId: string | null | undefined,
  groupId: string
): Promise<void> {
  await delay()
  const orgId = requireOrganizationId(organizationId)
  const removed = removeStoredGroup(orgId, groupId)
  if (!removed) {
    throw new CustomerGroupServiceError('Customer group not found.')
  }
}

export async function listCustomerGroupContactIds(
  organizationId: string | null | undefined,
  groupId: string
): Promise<string[]> {
  const group = await getCustomerGroup(organizationId, groupId)
  return [...group.contactIds]
}

export async function addCustomerGroupContacts(
  organizationId: string | null | undefined,
  groupId: string,
  contactIds: string[]
): Promise<CustomerGroup> {
  await delay()
  const orgId = requireOrganizationId(organizationId)
  const existing = getStoredGroup(orgId, groupId)
  if (!existing) {
    throw new CustomerGroupServiceError('Customer group not found.')
  }
  return replaceStoredGroup(orgId, {
    ...existing,
    contactIds: uniqueIds([...existing.contactIds, ...contactIds]),
    updatedAt: new Date().toISOString(),
  })
}

export async function removeCustomerGroupContact(
  organizationId: string | null | undefined,
  groupId: string,
  contactId: string
): Promise<CustomerGroup> {
  await delay()
  const orgId = requireOrganizationId(organizationId)
  const existing = getStoredGroup(orgId, groupId)
  if (!existing) {
    throw new CustomerGroupServiceError('Customer group not found.')
  }
  return replaceStoredGroup(orgId, {
    ...existing,
    contactIds: existing.contactIds.filter((id) => id !== contactId),
    updatedAt: new Date().toISOString(),
  })
}

export function resolveGroupContacts(
  group: CustomerGroup | null | undefined,
  contacts: ContactSummary[]
): ContactSummary[] {
  if (!group) return []
  const allowed = new Set(group.contactIds)
  return contacts.filter((contact) => allowed.has(contact.id))
}
