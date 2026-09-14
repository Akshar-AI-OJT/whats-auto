'use client'

import { useTranslations } from 'next-intl'
import type { InboxConversation, InboxConversationStatus, OrganizationMember } from '@/lib/api'
import { cn } from '@/lib/utils'
import { OrganizationAvatar } from '@/components/dashboard/OrganizationSwitcher'
import { InboxConversationActions } from './InboxConversationActions'
import { InboxAiModePill } from './InboxAiModePill'
import { InboxAiHandoverBanner } from './InboxAiHandoverBanner'
import { useInboxOrganization } from './InboxOrganizationContext'
import { contactInitials, contactLabel } from './inbox-utils'

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'open'
      ? 'bg-primary-pale text-positive-deep ring-primary/25'
      : status === 'pending'
        ? 'bg-dash-surface text-ink ring-dash-border'
        : 'bg-mute/15 text-mute ring-dash-border'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ring-1',
        tone
      )}
    >
      {label}
    </span>
  )
}

type InboxConversationHeaderProps = {
  conversation: InboxConversation
  members: OrganizationMember[]
  onConversationUpdated: (patch: Partial<InboxConversation>) => void
}

export function InboxConversationHeader({
  conversation,
  members,
  onConversationUpdated,
}: InboxConversationHeaderProps) {
  const t = useTranslations('dashboard.inbox')
  const { detailsOpen } = useInboxOrganization()

  const statusLabel = ['open', 'pending', 'closed'].includes(conversation.status)
    ? t(`filters.status.${conversation.status as InboxConversationStatus}`)
    : conversation.status

  return (
    <header className="sticky top-0 z-10 border-b border-dash-border bg-canvas/95 backdrop-blur-sm">
      <div className="relative px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <OrganizationAvatar
              initials={contactInitials(conversation)}
              size="md"
              className="shrink-0 rounded-xl"
            />
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight text-ink">
                {contactLabel(conversation)}
              </h2>
              <StatusBadge status={conversation.status} label={statusLabel} />
              {!detailsOpen ? (
                <span className="hidden shrink-0 min-[520px]:inline-flex">
                  <InboxAiModePill conversation={conversation} />
                </span>
              ) : null}
            </div>
          </div>

          <InboxConversationActions
            conversation={conversation}
            members={members}
            onUpdated={onConversationUpdated}
          />
        </div>
      </div>
      <InboxAiHandoverBanner conversation={conversation} />
    </header>
  )
}
