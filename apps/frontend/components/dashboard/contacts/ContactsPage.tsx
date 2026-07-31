'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Search, UserPlus, Users } from 'lucide-react'
import {
  api,
  type ApiError,
  type ContactSummary,
} from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'
import { AddContactSheet } from '@/components/dashboard/contacts/AddContactSheet'

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
  const {
    tenantOrganizationId,
    canViewContacts,
    canCreateContacts,
    isLoading: orgsLoading,
  } = useOrganizations()

  const [contacts, setContacts] = useState<ContactSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const organizationIdRef = useRef(tenantOrganizationId)
  organizationIdRef.current = tenantOrganizationId

  const loadContacts = useCallback(
    async (organizationId: string) => {
      if (!canViewContacts) {
        setContacts([])
        setListLoading(false)
        return
      }

      setListLoading(true)
      setListError(null)
      try {
        const { data } = await api.contacts.list()
        // Ignore stale responses from a previous workspace switch.
        if (organizationId !== organizationIdRef.current) return
        const rows = unwrapList(data).filter((c) => c.organizationId === organizationId)
        setContacts(rows)
      } catch (err) {
        if (organizationId !== organizationIdRef.current) return
        setContacts([])
        setListError((err as ApiError).message || t('errors.loadFailed'))
      } finally {
        if (organizationId === organizationIdRef.current) {
          setListLoading(false)
        }
      }
    },
    [canViewContacts, t]
  )

  useEffect(() => {
    if (orgsLoading) return
    if (!tenantOrganizationId) {
      setContacts([])
      setQuery('')
      setListLoading(true)
      setListError(null)
      return
    }
    void loadContacts(tenantOrganizationId)
  }, [orgsLoading, tenantOrganizationId, loadContacts])

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
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
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
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
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
          {canCreateContacts ? (
            <Button
              type="button"
              className="shrink-0 gap-2"
              onClick={() => setAddOpen(true)}
            >
              <UserPlus className="size-4" aria-hidden />
              {t('addCta')}
            </Button>
          ) : null}
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('listTitle')}
          description={t('listDescription')}
        />

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

        {listLoading || orgsLoading ? (
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
            {canCreateContacts ? (
              <Button
                type="button"
                className="mt-2 gap-2"
                onClick={() => setAddOpen(true)}
              >
                <UserPlus className="size-4" aria-hidden />
                {t('addCta')}
              </Button>
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
                  <WorkspaceAvatar initials={initialsFromContact(contact)} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {contact.name?.trim() || contact.phone}
                    </p>
                    <p className="truncate text-sm text-body">{contact.phone}</p>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5 text-sm text-body sm:items-end">
                  {contact.email ? (
                    <p className="truncate">{contact.email}</p>
                  ) : null}
                  {contact.company ? (
                    <p className="truncate text-mute">{contact.company}</p>
                  ) : null}
                  <p className="text-xs text-mute">
                    {t('addedAt', { date: formatCreatedAt(contact.createdAt) })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashboardPanel>

      {canCreateContacts ? (
        <AddContactSheet
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={() => {
            if (tenantOrganizationId) void loadContacts(tenantOrganizationId)
          }}
        />
      ) : null}
    </div>
  )
}
