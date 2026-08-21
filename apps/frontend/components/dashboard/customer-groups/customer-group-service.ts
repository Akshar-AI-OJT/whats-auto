import { api, type ContactSummary, type CustomerGroupSummary } from '@/lib/api'

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  const wrapped = data as { data?: T[] }
  return Array.isArray(wrapped.data) ? wrapped.data : []
}

export async function listCustomerGroups(
  _organizationId: string | null | undefined,
  _opts?: { status?: string }
): Promise<CustomerGroupSummary[]> {
  const { data } = await api.tags.list()
  return unwrapList<CustomerGroupSummary>(data)
}

export async function listCustomerGroupContacts(
  _organizationId: string | null | undefined,
  groupId: string
): Promise<ContactSummary[]> {
  const { data } = await api.tags.listContacts(groupId)
  return unwrapList<ContactSummary>(data)
}
