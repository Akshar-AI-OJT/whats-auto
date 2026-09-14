'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, X } from 'lucide-react'
import type { ContactSummary } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const COLLAPSED_VISIBLE = 8

type CampaignRecipientListProps = {
  audienceSelected: boolean
  contacts: ContactSummary[]
  selectedCount: number
  isAllContacts: boolean
  loading: boolean
  error: string | null
  onRetry: () => void
  onRemove: (contactId: string) => void
  compact?: boolean
  showCount?: boolean
  allowRemove?: boolean
  emptyMessage?: string
}

function displayName(contact: ContactSummary, unnamed: string) {
  return contact.name?.trim() || contact.phone || unnamed
}

export function CampaignRecipientList({
  audienceSelected,
  contacts,
  selectedCount,
  isAllContacts,
  loading,
  error,
  onRetry,
  onRemove,
  compact = false,
  showCount = true,
  allowRemove = true,
  emptyMessage,
}: CampaignRecipientListProps) {
  const t = useTranslations('dashboard.campaigns.form.recipients')
  const [expanded, setExpanded] = useState(false)

  const visibleContacts = useMemo(() => {
    if (expanded || contacts.length <= COLLAPSED_VISIBLE) return contacts
    return contacts.slice(0, COLLAPSED_VISIBLE)
  }, [contacts, expanded])

  if (!audienceSelected) return null

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-body">
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
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  if (selectedCount === 0) {
    return <p className="text-sm text-body">{emptyMessage ?? t('empty')}</p>
  }

  const countLabel = isAllContacts
    ? t('allCount', { count: selectedCount })
    : t('selectedCount', { count: selectedCount })

  return (
    <div className="space-y-2">
      {showCount ? <p className="text-sm font-medium text-ink">{countLabel}</p> : null}
      <ul
        className={cn(
          'divide-y divide-dash-border overflow-x-hidden overflow-y-auto rounded-2xl border border-dash-border bg-canvas',
          compact ? 'max-h-56' : 'max-h-72'
        )}
      >
        {visibleContacts.map((contact) => {
          const name = displayName(contact, t('unnamed'))
          return (
            <li
              key={contact.id}
              className="flex items-start gap-3 px-3 py-2.5 sm:items-center sm:px-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{name}</p>
                <p className="truncate text-sm text-body">{contact.phone}</p>
                {contact.email ? (
                  <p className="truncate text-xs text-mute">{contact.email}</p>
                ) : null}
              </div>
              {allowRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="shrink-0 text-mute hover:text-ink"
                  onClick={() => onRemove(contact.id)}
                  aria-label={t('removeAria', { name })}
                >
                  <X className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">{t('remove')}</span>
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {contacts.length > COLLAPSED_VISIBLE ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="px-0 text-body hover:text-ink"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t('showLess') : t('showAll', { count: contacts.length })}
        </Button>
      ) : null}
    </div>
  )
}
