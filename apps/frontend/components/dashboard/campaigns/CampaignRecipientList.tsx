'use client'

import { Loader2, X } from 'lucide-react'
import type { ContactSummary } from '@/lib/api'
import { Button } from '@/components/ui/button'

type CampaignRecipientListProps = {
  audienceSelected: boolean
  contacts: ContactSummary[]
  selectedCount: number
  isAllContacts?: boolean
  allowRemove?: boolean
  emptyMessage?: string
  loading?: boolean
  error?: string | null
  compact?: boolean
  showCount?: boolean
  onRetry?: () => void
  onRemove?: (contactId: string) => void
}

export function CampaignRecipientList({
  audienceSelected,
  contacts,
  selectedCount,
  allowRemove = true,
  emptyMessage,
  loading = false,
  error = null,
  compact = false,
  showCount = true,
  onRetry,
  onRemove,
}: CampaignRecipientListProps) {
  if (!audienceSelected) return null

  if (loading) {
    return (
      <p className={`flex items-center gap-2 text-sm text-body ${compact ? '' : 'mt-2'}`}>
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading recipients…
      </p>
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
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  if (contacts.length === 0) {
    return emptyMessage ? <p className="text-sm text-body">{emptyMessage}</p> : null
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2 pt-1'}>
      {showCount ? (
        <p className="text-xs font-medium text-mute">{selectedCount} recipients</p>
      ) : null}
      <ul className="max-h-48 space-y-1 overflow-auto rounded-xl border border-dash-border p-2">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-ink"
          >
            <span className="min-w-0 truncate">
              {contact.name || contact.phone}
            </span>
            {allowRemove && onRemove ? (
              <button
                type="button"
                className="rounded p-1 text-mute hover:bg-dash-surface hover:text-ink"
                aria-label={`Remove ${contact.name || contact.phone}`}
                onClick={() => onRemove(contact.id)}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
