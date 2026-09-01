'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/i18n/navigation'
import { Loader2, Search, Trash2, Upload, UserPlus, Users } from 'lucide-react'
import { api, type ApiError, type ContactSummary } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { OrganizationAvatar } from '@/components/dashboard/OrganizationSwitcher'
import { AddContactSheet } from '@/components/dashboard/contacts/AddContactSheet'
import { ContactDeleteDialog } from '@/components/dashboard/contacts/ContactDeleteDialog'
import { ImportContactsDialog } from '@/components/dashboard/contacts/ImportContactsDialog'

function unwrapList<T>(data: { data?: T[] } | T[] | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

function initialsFromContact(contact: ContactSummary) {
  const source = (contact.name?.trim() || contact.phone).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase() || '?'
}

function formatCreatedAt(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function ContactsPage() {
  const t = useTranslations('dashboard.contacts')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    canViewContacts,
    canCreateContacts,
    canDeleteContacts,
    canImportContacts,
    isLoading: orgsLoading,
  } = useOrganizations()

  const addFromQuery = searchParams.get('add') === '1'
  const [addForced, setAddForced] = useState(false)
  const addOpen = canCreateContacts && (addFromQuery || addForced)
  const [query, setQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ContactSummary | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const contactsQuery = useQuery({
    queryKey: queryKeys.contacts.list(tenantOrganizationId),
    queryFn: async () => {
      const organizationId = tenantOrganizationId!
      const { data } = await api.contacts.list()
      return unwrapList(data).filter((c) => c.organizationId === organizationId)
    },
    enabled: !orgsLoading && Boolean(tenantOrganizationId) && canViewContacts,
    staleTime: 2 * 60_000,
  })

  const contacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data])
  const listLoading = contactsQuery.isLoading || orgsLoading
  const listError = contactsQuery.error
    ? (contactsQuery.error as unknown as ApiError).message || t('errors.loadFailed')
    : null

  function mapDeleteError(apiError: ApiError): string {
    if (apiError.status === 401) return t('add.errors.sessionExpired')
    if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
      return t('errors.deletePermissionDenied')
    }
    if (apiError.status === 404 || apiError.code === 'E_CONTACT_NOT_FOUND') {
      return t('errors.deleteNotFound')
    }
    if (apiError.code === 'E_CONTACT_ALREADY_DELETED') {
      return t('errors.alreadyDeleted')
    }
    return apiError.message || t('errors.deleteFailed')
  }

  async function refreshContacts() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.contacts.all(tenantOrganizationId),
    })
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deletePending) return

    setDeletePending(true)
    setDeleteError(null)
    try {
      await api.contacts.delete(deleteTarget.id)
      setDeleteTarget(null)
      await refreshContacts()
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.status === 404 || apiError.code === 'E_CONTACT_ALREADY_DELETED') {
        await refreshContacts()
      }
      setDeleteError(mapDeleteError(apiError))
    } finally {
      setDeletePending(false)
    }
  }

  useEffect(() => {
    if (orgsLoading || canCreateContacts || !addFromQuery) return
    router.replace(pathname)
  }, [orgsLoading, canCreateContacts, addFromQuery, pathname, router])

  // Clear local search and delete dialog when the organization changes.
  const orgScope = tenantOrganizationId ?? ''
  const [prevOrgScope, setPrevOrgScope] = useState(orgScope)
  if (prevOrgScope !== orgScope) {
    setPrevOrgScope(orgScope)
    setQuery('')
    setDeleteTarget(null)
    setDeleteError(null)
  }

  function handleAddOpenChange(open: boolean) {
    if (open) {
      if (!canCreateContacts) return
      setAddForced(true)
      return
    }
    setAddForced(false)
    if (addFromQuery) {
      router.replace(pathname)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      const haystack = [c.name, c.phone, c.phoneNormalized, c.email, c.company]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [contacts, query])

  if (!orgsLoading && !canViewContacts) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
        <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <div
            role="alert"
            className="mt-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"
          >
            {t('errors.permissionDenied')}
          </div>
        </DashboardPanel>
      </div>
    )
  }

  const showEmpty = !listLoading && !listError && contacts.length === 0
  const showNoMatches = !listLoading && !listError && contacts.length > 0 && filtered.length === 0

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
              {t('subtitle')}
            </p>
          </div>
          {canCreateContacts || canImportContacts ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {canImportContacts ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setImportOpen(true)}
                >
                  <Upload className="size-4" aria-hidden />
                  {t('importCta')}
                </Button>
              ) : null}
              {canCreateContacts ? (
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => handleAddOpenChange(true)}
                >
                  <UserPlus className="size-4" aria-hidden />
                  {t('addCta')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader title={t('listTitle')} description={t('listDescription')} />

        {!showEmpty && !listError ? (
          <div className="relative mt-5 max-w-md">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-10"
              aria-label={t('searchPlaceholder')}
            />
          </div>
        ) : null}

        {listLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : listError ? (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {listError}
          </div>
        ) : showEmpty ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <Users className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{t('emptyTitle')}</p>
            <p className="max-w-sm text-sm text-body">{t('emptyDescription')}</p>
            {canCreateContacts || canImportContacts ? (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {canImportContacts ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload className="size-4" aria-hidden />
                    {t('importCta')}
                  </Button>
                ) : null}
                {canCreateContacts ? (
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={() => handleAddOpenChange(true)}
                  >
                    <UserPlus className="size-4" aria-hidden />
                    {t('addCta')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : showNoMatches ? (
          <p className="mt-8 py-10 text-center text-sm text-body">{t('noMatches')}</p>
        ) : (
          <ul className="mt-6 divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
            {filtered.map((contact) => (
              <li
                key={contact.id}
                className="flex flex-col gap-3 bg-canvas px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <OrganizationAvatar initials={initialsFromContact(contact)} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {contact.name?.trim() || contact.phone}
                    </p>
                    <p className="truncate text-sm text-body">{contact.phone}</p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm text-body sm:items-end">
                    {contact.email ? <p className="truncate">{contact.email}</p> : null}
                    {contact.company ? <p className="truncate text-mute">{contact.company}</p> : null}
                    <p className="text-xs text-mute">
                      {t('addedAt', { date: formatCreatedAt(contact.createdAt) })}
                    </p>
                  </div>
                  {canDeleteContacts ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-mute hover:bg-negative/10 hover:text-negative"
                      aria-label={t('deleteAria', {
                        name: contact.name?.trim() || contact.phone,
                      })}
                      onClick={() => {
                        setDeleteError(null)
                        setDeleteTarget(contact)
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashboardPanel>

      {canCreateContacts ? (
        <AddContactSheet
          open={addOpen}
          onOpenChange={handleAddOpenChange}
          onCreated={() => {
            void refreshContacts()
          }}
        />
      ) : null}

      {canImportContacts ? (
        <ImportContactsDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => {
            void refreshContacts()
          }}
        />
      ) : null}

      {canDeleteContacts ? (
        <ContactDeleteDialog
          contact={deleteTarget}
          pending={deletePending}
          error={deleteError}
          onOpenChange={(open) => {
            if (!open && !deletePending) {
              setDeleteTarget(null)
              setDeleteError(null)
            }
          }}
          onConfirm={() => {
            void handleDeleteConfirm()
          }}
        />
      ) : null}
    </div>
  )
}
