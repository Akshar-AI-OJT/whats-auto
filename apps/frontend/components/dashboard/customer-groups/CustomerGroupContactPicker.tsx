'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Search } from 'lucide-react'
import type { ContactSummary } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OrganizationAvatar } from '@/components/dashboard/OrganizationSwitcher'
import { cn } from '@/lib/utils'
import { contactDisplayName, initialsFromContact } from './customer-group-utils'

type CustomerGroupContactPickerProps = {
  contacts: ContactSummary[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  disabled?: boolean
  className?: string
}

export function CustomerGroupContactPicker({
  contacts,
  selectedIds,
  onChange,
  loading = false,
  error = null,
  onRetry,
  disabled = false,
  className,
}: CustomerGroupContactPickerProps) {
  const t = useTranslations('dashboard.customerGroups.picker')
  const [query, setQuery] = useState('')

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return contacts
    return contacts.filter((contact) => {
      const haystack = [contact.name, contact.phone, contact.phoneNormalized, contact.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [contacts, query])

  function toggle(contactId: string) {
    if (disabled) return
    if (selected.has(contactId)) {
      onChange(selectedIds.filter((id) => id !== contactId))
      return
    }
    onChange([...selectedIds, contactId])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-xl border border-negative/25 bg-negative/5 px-3 py-2.5 text-sm text-negative sm:flex-row sm:items-center sm:justify-between"
      >
        <p>{error}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="xs" onClick={onRetry}>
            {t('retry')}
          </Button>
        ) : null}
      </div>
    )
  }

  if (contacts.length === 0) {
    return <p className="py-8 text-center text-sm text-body">{t('empty')}</p>
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col space-y-3', className)}>
      <div className="relative">
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
          disabled={disabled}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-body">{t('noMatches')}</p>
      ) : (
        <ul className="min-h-64 flex-1 divide-y divide-dash-border overflow-y-auto rounded-2xl border border-dash-border lg:min-h-0">
          {filtered.map((contact) => {
            const name = contactDisplayName(contact, t('unnamed'))
            const checked = selected.has(contact.id)
            return (
              <li key={contact.id}>
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-3 px-3 py-2.5 sm:items-center sm:px-4',
                    disabled && 'cursor-not-allowed opacity-70'
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-primary sm:mt-0"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(contact.id)}
                  />
                  <OrganizationAvatar initials={initialsFromContact(contact)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{name}</p>
                    <p className="truncate text-sm text-body">{contact.phone}</p>
                    {contact.email ? (
                      <p className="truncate text-xs text-mute">{contact.email}</p>
                    ) : null}
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-sm font-medium text-ink">
        {t('selectedCount', { count: selectedIds.length })}
      </p>
    </div>
  )
}
