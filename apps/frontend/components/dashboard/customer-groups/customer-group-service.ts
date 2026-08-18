/**
 * Customer Groups adapter over the existing Tags APIs.
 *
 *   GET    /api/v1/tags
 *   POST   /api/v1/tags
 *   GET    /api/v1/tags/:id
 *   PATCH  /api/v1/tags/:id
 *   DELETE /api/v1/tags/:id
 *   GET    /api/v1/tags/:id/contacts
 *   POST   /api/v1/tags/:id/contacts        body: { contactId }
 *   DELETE /api/v1/tags/:id/contacts/:contactId
 *
 * The product UI says "Customer Group"; the HTTP resource is Tag.
 */

import {
  api,
  type ApiError,
  type ContactSummary,
  type CreateCustomerGroupBody,
  type CustomerGroup,
  type CustomerGroupSummaryStats,
  type ListCustomerGroupsParams,
  type TagRecord,
  type UpdateCustomerGroupBody,
} from '@/lib/api'
import { remapTagErrorMessage, unwrapContacts } from './customer-group-utils'

export const customerGroupQueryKeys = {
  all: ['customer-groups'] as const,
  list: (organizationId: string | null | undefined) =>
    [...customerGroupQueryKeys.all, 'list', organizationId ?? 'none'] as const,
  summary: (organizationId: string | null | undefined) =>
    [...customerGroupQueryKeys.all, 'summary', organizationId ?? 'none'] as const,
  detail: (organizationId: string | null | undefined, id: string) =>
    [...customerGroupQueryKeys.all, 'detail', organizationId ?? 'none', id] as const,
  members: (organizationId: string | null | undefined, id: string) =>
    [...customerGroupQueryKeys.all, 'members', organizationId ?? 'none', id] as const,
}

export class CustomerGroupServiceError extends Error {
  status?: number
  code?: string

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message)
    this.name = 'CustomerGroupServiceError'
    this.status = options?.status
    this.code = options?.code
  }
}

export type CustomerGroupWriteResult = {
  group: CustomerGroup
  failedAssignments: number
  attemptedAssignments: number
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

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))]
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as ApiError).message === 'string' &&
      'status' in error &&
      typeof (error as ApiError).status === 'number'
  )
}

function throwMapped(error: unknown): never {
  if (isApiError(error)) {
    throw new CustomerGroupServiceError(remapTagErrorMessage(error), {
      status: error.status,
      code: error.code,
    })
  }
  if (error instanceof CustomerGroupServiceError) {
    throw error
  }
  if (error instanceof Error) {
    throw new CustomerGroupServiceError(error.message)
  }
  throw new CustomerGroupServiceError('Request failed')
}

function unwrapTag(payload: unknown): TagRecord {
  if (!payload || typeof payload !== 'object') {
    throw new CustomerGroupServiceError('Customer group not found.', {
      status: 404,
      code: 'E_TAG_NOT_FOUND',
    })
  }
  const wrapped = payload as { data?: TagRecord } & Partial<TagRecord>
  const tag = wrapped.data && wrapped.data.id ? wrapped.data : (wrapped as TagRecord)
  if (!tag?.id) {
    throw new CustomerGroupServiceError('Customer group not found.', {
      status: 404,
      code: 'E_TAG_NOT_FOUND',
    })
  }
  return tag
}

function unwrapTagList(payload: unknown): TagRecord[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: TagRecord[] }).data)) {
    return (payload as { data: TagRecord[] }).data
  }
  return []
}

function mapTagToCustomerGroup(tag: TagRecord, contactIds?: string[]): CustomerGroup {
  const hasLoadedMembers = contactIds !== undefined
  return {
    id: tag.id,
    organizationId: tag.organizationId,
    name: tag.name,
    description: '',
    type: 'static',
    status: 'active',
    contactIds: contactIds ?? [],
    contactCount: hasLoadedMembers ? contactIds.length : Number(tag.contactCount ?? 0),
    usedInCampaigns: null,
    createdAt: typeof tag.createdAt === 'string' ? tag.createdAt : String(tag.createdAt ?? ''),
    updatedAt: null,
  }
}

function isAlreadyAssigned(error: unknown): boolean {
  if (!isApiError(error)) return false
  return error.status === 409 || error.code === 'E_TAG_ASSIGNMENT_EXISTS'
}

function isAssignmentMissing(error: unknown): boolean {
  if (!isApiError(error)) return false
  return error.status === 404 || error.code === 'E_TAG_ASSIGNMENT_NOT_FOUND'
}

async function assignContactsOneByOne(tagId: string, contactIds: string[]): Promise<number> {
  let failed = 0
  for (const contactId of contactIds) {
    try {
      await api.tags.contacts.add(tagId, { contactId })
    } catch (error) {
      if (isAlreadyAssigned(error)) continue
      failed += 1
    }
  }
  return failed
}

async function removeContactsOneByOne(tagId: string, contactIds: string[]): Promise<number> {
  let failed = 0
  for (const contactId of contactIds) {
    try {
      await api.tags.contacts.remove(tagId, contactId)
    } catch (error) {
      if (isAssignmentMissing(error)) continue
      failed += 1
    }
  }
  return failed
}

export async function listCustomerGroups(
  organizationId: string | null | undefined,
  params: ListCustomerGroupsParams = {}
): Promise<CustomerGroup[]> {
  requireOrganizationId(organizationId)
  try {
    const { data } = await api.tags.list()
    const search = params.search?.trim().toLowerCase() ?? ''
    const status = params.status ?? 'all'

    return unwrapTagList(data)
      .map((tag) => mapTagToCustomerGroup(tag))
      .filter((group) => {
        if (status !== 'all' && group.status !== status) return false
        if (!search) return true
        return group.name.toLowerCase().includes(search)
      })
  } catch (error) {
    throwMapped(error)
  }
}

export async function getCustomerGroupSummary(
  organizationId: string | null | undefined
): Promise<CustomerGroupSummaryStats> {
  const groups = await listCustomerGroups(organizationId)
  return {
    totalGroups: groups.length,
    totalContacts: groups.reduce((sum, group) => sum + group.contactCount, 0),
    usedInCampaigns: null,
    engagementRate: null,
  }
}

export async function getCustomerGroup(
  organizationId: string | null | undefined,
  groupId: string
): Promise<CustomerGroup> {
  requireOrganizationId(organizationId)
  try {
    const { data } = await api.tags.get(groupId)
    return mapTagToCustomerGroup(unwrapTag(data))
  } catch (error) {
    throwMapped(error)
  }
}

export async function getCustomerGroupWithMembers(
  organizationId: string | null | undefined,
  groupId: string
): Promise<CustomerGroup> {
  const group = await getCustomerGroup(organizationId, groupId)
  const contacts = await listCustomerGroupContacts(organizationId, groupId)
  const contactIds = contacts.map((contact) => contact.id)
  return {
    ...group,
    contactIds,
    contactCount: contactIds.length,
  }
}

export async function createCustomerGroup(
  organizationId: string | null | undefined,
  body: CreateCustomerGroupBody
): Promise<CustomerGroupWriteResult> {
  requireOrganizationId(organizationId)
  const name = normalizeName(body.name)
  if (!name) {
    throw new CustomerGroupServiceError('Group name is required.', { status: 422 })
  }

  let tag: TagRecord
  try {
    const { data } = await api.tags.create({ name })
    tag = unwrapTag(data)
  } catch (error) {
    throwMapped(error)
  }

  const contactIds = uniqueIds(body.contactIds ?? [])
  const failedAssignments =
    contactIds.length > 0 ? await assignContactsOneByOne(tag.id, contactIds) : 0
  const members = contactIds.length
    ? await listCustomerGroupContacts(organizationId, tag.id)
    : []

  return {
    group: mapTagToCustomerGroup(tag, members.map((contact) => contact.id)),
    failedAssignments,
    attemptedAssignments: contactIds.length,
  }
}

export async function updateCustomerGroup(
  organizationId: string | null | undefined,
  groupId: string,
  body: UpdateCustomerGroupBody
): Promise<CustomerGroupWriteResult> {
  requireOrganizationId(organizationId)
  const existing = await getCustomerGroupWithMembers(organizationId, groupId)

  const name = body.name !== undefined ? normalizeName(body.name) : existing.name
  if (!name) {
    throw new CustomerGroupServiceError('Group name is required.', { status: 422 })
  }

  let tagId = existing.id
  if (name !== existing.name) {
    try {
      const { data } = await api.tags.update(groupId, { name })
      tagId = unwrapTag(data).id
    } catch (error) {
      throwMapped(error)
    }
  }

  let failedAssignments = 0
  let attemptedAssignments = 0
  if (body.contactIds !== undefined) {
    const nextIds = uniqueIds(body.contactIds)
    const current = new Set(existing.contactIds)
    const next = new Set(nextIds)
    const toAdd = nextIds.filter((id) => !current.has(id))
    const toRemove = existing.contactIds.filter((id) => !next.has(id))
    attemptedAssignments = toAdd.length + toRemove.length
    if (toAdd.length) failedAssignments += await assignContactsOneByOne(tagId, toAdd)
    if (toRemove.length) failedAssignments += await removeContactsOneByOne(tagId, toRemove)
  }

  const group = await getCustomerGroupWithMembers(organizationId, tagId)
  return {
    group,
    failedAssignments,
    attemptedAssignments,
  }
}

export async function deleteCustomerGroup(
  organizationId: string | null | undefined,
  groupId: string
): Promise<void> {
  requireOrganizationId(organizationId)
  try {
    await api.tags.delete(groupId)
  } catch (error) {
    throwMapped(error)
  }
}

export async function listCustomerGroupContacts(
  organizationId: string | null | undefined,
  groupId: string
): Promise<ContactSummary[]> {
  requireOrganizationId(organizationId)
  try {
    const { data } = await api.tags.contacts.list(groupId)
    return unwrapContacts(data)
  } catch (error) {
    throwMapped(error)
  }
}

export async function listCustomerGroupContactIds(
  organizationId: string | null | undefined,
  groupId: string
): Promise<string[]> {
  const contacts = await listCustomerGroupContacts(organizationId, groupId)
  return contacts.map((contact) => contact.id)
}

export async function addCustomerGroupContacts(
  organizationId: string | null | undefined,
  groupId: string,
  contactIds: string[]
): Promise<CustomerGroupWriteResult> {
  requireOrganizationId(organizationId)
  const ids = uniqueIds(contactIds)
  const failedAssignments = ids.length ? await assignContactsOneByOne(groupId, ids) : 0
  const group = await getCustomerGroupWithMembers(organizationId, groupId)
  return {
    group,
    failedAssignments,
    attemptedAssignments: ids.length,
  }
}

export async function removeCustomerGroupContact(
  organizationId: string | null | undefined,
  groupId: string,
  contactId: string
): Promise<CustomerGroup> {
  requireOrganizationId(organizationId)
  try {
    await api.tags.contacts.remove(groupId, contactId)
  } catch (error) {
    throwMapped(error)
  }
  return getCustomerGroupWithMembers(organizationId, groupId)
}
