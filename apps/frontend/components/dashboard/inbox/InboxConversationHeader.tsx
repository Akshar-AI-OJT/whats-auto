'use client'

import { useTranslations } from 'next-intl'
import { PanelRight } from 'lucide-react'
import type { InboxConversation, InboxConversationStatus, OrganizationMember } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'
import { InboxConversationActions } from './InboxConversationActions'
import { InboxAiModePill } from './InboxAiModePill'
import { InboxAiHandoverBanner } from './InboxAiHandoverBanner'
import { useInboxWorkspace } from './InboxWorkspaceContext'
import {
  contactInitials,
  contactLabel,
  formatMessageTime,
} from './inbox-utils'

function StatusBadge({
  status,
  label,
}: {
  status: string
  label: string
}) {
  const tone =
    status === 'open'
      ? 'bg-primary-pale text-positive-deep ring-primary/25'
      : status === 'pending'
        ? 'bg-dash-surface text-ink ring-dash-border'
        : 'bg-mute/15 text-mute ring-dash-border'

  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1',
        tone
      )}
    >
      {label}
    </span>
  )
}

type InboxConversationHeaderProps = {
  conversation: InboxConversation
  agentLabel: string
  members: OrganizationMember[]
  onConversationUpdated: (patch: Partial<InboxConversation>) => void
}

export function InboxConversationHeader({
  conversation,
  agentLabel,
  members,
  onConversationUpdated,
}: InboxConversationHeaderProps) {
  const t = useTranslations('dashboard.inbox')
  const tDetails = useTranslations('dashboard.inbox.details')
  const { setDetailsOpen } = useInboxWorkspace()
  const contact = conversation.contact
  const updated =
    conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt

  const statusLabel = ['open', 'pending', 'closed'].includes(conversation.status)
    ? t(`filters.status.${conversation.status as InboxConversationStatus}`)
    : conversation.status

  const secondaryContact = [contact?.phone, contact?.email?.trim()]
    .filter(Boolean)
    .join(' · ')

  return (
    <header className="sticky top-0 z-10 border-b border-dash-border bg-canvas/95 backdrop-blur-sm">
      <div className="px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <WorkspaceAvatar
            initials={contactInitials(conversation)}
            size="md"
            className="rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-lg font-semibold tracking-tight text-ink">
                {contactLabel(conversation)}
              </h2>
              <StatusBadge status={conversation.status} label={statusLabel} />
              <InboxAiModePill conversation={conversation} />
            </div>
            {secondaryContact ? (
              <p className="mt-0.5 truncate text-sm text-mute">{secondaryContact}</p>
            ) : null}
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-body">
              <div className="flex gap-1.5">
                <dt className="text-mute">{t('columns.agent')}</dt>
                <dd className="font-medium text-ink">{agentLabel}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-mute">{t('columns.updated')}</dt>
                <dd className="tabular-nums">{formatMessageTime(updated)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1.5 xl:hidden"
            onClick={() => setDetailsOpen(true)}
          >
            <PanelRight className="size-3.5" aria-hidden />
            {tDetails('openPanel')}
          </Button>
          <InboxConversationActions
            conversation={conversation}
            members={members}
            onUpdated={onConversationUpdated}
          />
        </div>
        </div>
      </div>
      <InboxAiHandoverBanner conversation={conversation} />
    </header>
  )
}
