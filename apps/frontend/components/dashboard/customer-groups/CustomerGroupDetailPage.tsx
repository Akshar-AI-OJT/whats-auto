'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Loader2, Plus, Search, Trash2, UserMinus } from 'lucide-react'
import { api, type ContactSummary, type CustomerGroupStatus } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { usePermissions } from '@/hooks/usePermissions'
import { PERMISSIONS } from '@/lib/rbac'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'
import { DashboardToast, useDashboardToast } from '@/components/dashboard/ui/use-dashboard-toast'
import { CustomerGroupDeleteDialog } from './CustomerGroupDeleteDialog'
import { CustomerGroupFormDialog } from './CustomerGroupFormDialog'
import {
  CustomerGroupStatusBadge,
  CustomerGroupTypeBadge,
} from './CustomerGroupStatusBadge'
import {
  customerGroupQueryKeys,
  deleteCustomerGroup,
  getCustomerGroup,
  listCustomerGroupContacts,
  removeCustomerGroupContact,
  updateCustomerGroup,
  type CustomerGroupWriteResult,
} from './customer-group-service'
import {
  contactDisplayName,
  customerGroupErrorMessage,
  formatGroupDate,
  initialsFromContact,
  unwrapContacts,
} from './customer-group-utils'

type CustomerGroupDetailPageProps = {
  groupId: string
}

export function CustomerGroupDetailPage({ groupId }: CustomerGroupDetailPageProps) {
  const t = useTranslations('dashboard.customerGroups')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast, showToast, clearToast } = useDashboardToast()
  const {
    tenantOrganizationId,
    canViewContacts,
    isLoading: orgsLoading,
  } = useOrganizations()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission(PERMISSIONS.CONTACTS_EDIT)
  const canDelete = hasPermission(PERMISSIONS.CONTACTS_DELETE)

  const [memberQuery, setMemberQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const groupQuery = useQuery({
    queryKey: customerGroupQueryKeys.detail(tenantOrganizationId, groupId),
    enabled: Boolean(tenantOrganizationId) && canViewContacts && !orgsLoading,
    queryFn: () => getCustomerGroup(tenantOrganizationId, groupId),
  })

  const membersQuery = useQuery({
    queryKey: customerGroupQueryKeys.members(tenantOrganizationId, groupId),
    enabled: Boolean(tenantOrganizationId) && canViewContacts && !orgsLoading,
    queryFn: () => listCustomerGroupContacts(tenantOrganizationId, groupId),
  })

  const contactsQuery = useQuery({
    queryKey: [...customerGroupQueryKeys.all, 'contacts', tenantOrganizationId],
    enabled: Boolean(tenantOrganizationId) && canViewContacts && !orgsLoading && formOpen,
    queryFn: async () => {
      const { data } = await api.contacts.list()
      return unwrapContacts(data)
    },
  })

  const group = groupQuery.data ?? null
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const filteredMembers = useMemo(() => {
    const needle = memberQuery.trim().toLowerCase()
    if (!needle) return members
    return members.filter((contact) => {
      const haystack = [contact.name, contact.phone, contact.phoneNormalized, contact.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [members, memberQuery])

  function invalidateGroups() {
    return queryClient.invalidateQueries({ queryKey: customerGroupQueryKeys.all })
  }

  const saveMutation = useMutation({
    mutationFn: async (values: {
      name: string
      description: string
      status: CustomerGroupStatus
      contactIds: string[]
    }): Promise<CustomerGroupWriteResult> =>
      updateCustomerGroup(tenantOrganizationId, groupId, values),
    onSuccess: async (result) => {
      await invalidateGroups()
      if (result.failedAssignments > 0) {
        setFormError(
          t('errors.membersPartialFailed', {
            failed: result.failedAssignments,
            total: result.attemptedAssignments,
          })
        )
        return
      }
      setFormOpen(false)
      setFormError(null)
      showToast(t('toast.updated'), 'success')
    },
    onError: (err) => {
      setFormError(customerGroupErrorMessage(err, t, 'errors.saveFailed'))
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (contact: ContactSummary) =>
      removeCustomerGroupContact(tenantOrganizationId, groupId, contact.id),
    onSuccess: async () => {
      setRemoveError(null)
      showToast(t('toast.memberRemoved'), 'success')
      await invalidateGroups()
    },
    onError: (err) => {
      setRemoveError(customerGroupErrorMessage(err, t, 'errors.removeFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteCustomerGroup(tenantOrganizationId, groupId)
    },
    onSuccess: async () => {
      await invalidateGroups()
      router.push('/dashboard/customer-groups')
    },
    onError: (err) => {
      setDeleteError(customerGroupErrorMessage(err, t, 'errors.deleteFailed'))
    },
  })

  if (!orgsLoading && !canViewContacts) {
    return (
      <DashboardPanel as="section" className="px-4 py-6">
        <p role="alert" className="text-sm text-negative">
          {t('errors.permissionDenied')}
        </p>
      </DashboardPanel>
    )
  }

  if (orgsLoading || groupQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  if (groupQuery.isError || !group) {
    return (
      <DashboardPanel as="section" className="space-y-4 px-4 py-6">
        <p role="alert" className="text-sm text-negative">
          {customerGroupErrorMessage(groupQuery.error, t, 'errors.notFound')}
        </p>
        <Button type="button" variant="outline" size="xs" onClick={() => void groupQuery.refetch()}>
          {t('retry')}
        </Button>
        <Link href="/dashboard/customer-groups" className="block text-sm font-medium text-ink underline">
          {t('backToList')}
        </Link>
      </DashboardPanel>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div>
        <Link
          href="/dashboard/customer-groups"
          className="inline-flex items-center gap-2 text-sm font-medium text-body hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('backToList')}
        </Link>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">{group.name}</h1>
            <p className="mt-1 max-w-2xl text-sm text-body">
              {group.description || t('noDescription')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CustomerGroupTypeBadge label={t('type.static')} />
              <CustomerGroupStatusBadge status={group.status} label={t(`status.${group.status}`)} />
              <span className="text-sm text-mute">
                {t('detail.createdOn', { date: formatGroupDate(group.createdAt, locale) })}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={!membersQuery.isSuccess}
                onClick={() => {
                  setFormError(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="size-4" aria-hidden />
                {t('actions.edit')}
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2 text-negative hover:text-negative"
                onClick={() => {
                  setDeleteError(null)
                  setDeleteOpen(true)
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                {t('actions.delete')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {toast ? (
        <DashboardToast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
      ) : null}

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg text-ink">{t('detail.membersTitle')}</h2>
            <p className="text-sm text-body">
              {t('detail.membersCount', {
                count: membersQuery.isSuccess ? members.length : group.contactCount,
              })}
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              className="gap-2 self-start"
              disabled={!membersQuery.isSuccess}
              onClick={() => {
                setFormError(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" aria-hidden />
              {t('actions.addContacts')}
            </Button>
          ) : null}
        </div>

        {members.length > 0 ? (
          <div className="relative mt-5 max-w-md">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              type="search"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder={t('picker.searchPlaceholder')}
              className="pl-10"
              aria-label={t('picker.searchPlaceholder')}
            />
          </div>
        ) : null}

        {membersQuery.isLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('picker.loading')}
          </div>
        ) : membersQuery.isError ? (
          <div
            role="alert"
            className="mt-8 flex flex-col gap-3 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative sm:flex-row sm:items-center sm:justify-between"
          >
            <p>
              {customerGroupErrorMessage(membersQuery.error, t, 'picker.loadFailed')}
            </p>
            <Button type="button" variant="outline" size="xs" onClick={() => void membersQuery.refetch()}>
              {t('retry')}
            </Button>
          </div>
        ) : members.length === 0 ? (
          <p className="mt-8 py-10 text-center text-sm text-body">{t('detail.emptyMembers')}</p>
        ) : filteredMembers.length === 0 ? (
          <p className="mt-8 py-10 text-center text-sm text-body">{t('picker.noMatches')}</p>
        ) : (
          <ul className="mt-6 divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
            {filteredMembers.map((contact) => {
              const name = contactDisplayName(contact, t('picker.unnamed'))
              return (
                <li
                  key={contact.id}
                  className="flex flex-col gap-3 bg-canvas px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <WorkspaceAvatar initials={initialsFromContact(contact)} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{name}</p>
                      <p className="truncate text-sm text-body">{contact.phone}</p>
                      {contact.email ? (
                        <p className="truncate text-xs text-mute">{contact.email}</p>
                      ) : null}
                    </div>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="shrink-0 gap-1 text-mute hover:text-negative"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(contact)}
                    >
                      <UserMinus className="size-3.5" aria-hidden />
                      {t('actions.removeContact')}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {removeError ? (
          <p role="alert" className="mt-4 text-sm text-negative">
            {removeError}
          </p>
        ) : null}
      </DashboardPanel>

      <CustomerGroupFormDialog
        open={formOpen}
        mode="edit"
        group={
          group
            ? {
                ...group,
                contactIds: members.map((contact) => contact.id),
                contactCount: members.length,
                updatedAt: String(membersQuery.dataUpdatedAt),
              }
            : group
        }
        contacts={contactsQuery.data ?? []}
        contactsLoading={contactsQuery.isLoading}
        contactsError={
          contactsQuery.isError
            ? customerGroupErrorMessage(contactsQuery.error, t, 'picker.loadFailed')
            : null
        }
        onRetryContacts={() => {
          void contactsQuery.refetch()
        }}
        pending={saveMutation.isPending}
        error={formError}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setFormError(null)
        }}
        onSubmit={(values) => saveMutation.mutate(values)}
      />

      <CustomerGroupDeleteDialog
        open={deleteOpen}
        group={group}
        pending={deleteMutation.isPending}
        error={deleteError}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
