'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, PanelRightClose, StickyNote } from 'lucide-react'
import {
  api,
  type ApiError,
  type InboxConversation,
  type InboxConversationStatus,
  type OrganizationMember,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { useWhatsappConfigs } from '@/hooks/useWhatsappConfigs'
import { InboxThreadNotes } from './InboxThreadNotes'
import { InboxAiModePill } from './InboxAiModePill'
import { useInboxOrganization } from './InboxOrganizationContext'
import { formatMessageTime, unwrapSingle } from './inbox-utils'

function unwrapMembers(data: unknown): OrganizationMember[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: OrganizationMember[] }).data
  }
  return []
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="text-sm font-medium break-all text-ink sm:text-right">{value}</dd>
    </div>
  )
}

type InboxConversationDetailsProps = {
  conversationId: string
  className?: string
  onClosePanel?: () => void
}

export function InboxConversationDetails({
  conversationId,
  className,
  onClosePanel,
}: InboxConversationDetailsProps) {
  const t = useTranslations('dashboard.inbox')
  const tDetails = useTranslations('dashboard.inbox.details')
  const {
    tenantOrganizationId,
    canViewInbox,
    canViewWhatsapp,
    isLoading: orgsLoading,
  } = useOrganizations()
  const inbox = useInboxOrganization()
  const setInboxConversationId = inbox.setConversationId
  const setInboxConversation = inbox.setConversation
  const setInboxMembers = inbox.setMembers
  const inboxConversationId = inbox.conversationId
  const inboxConversation = inbox.conversation
  const inboxMembers = inbox.members

  const [tabState, setTabState] = useState<{ conversationId: string; tab: 'info' | 'notes' }>({
    conversationId,
    tab: 'info',
  })

  const detailsEnabled =
    !orgsLoading && Boolean(tenantOrganizationId) && canViewInbox && Boolean(conversationId)

  const detailKey = queryKeys.inbox.detail(tenantOrganizationId, conversationId)
  const membersKey = queryKeys.team.members(tenantOrganizationId)

  const conversationQuery = useQuery({
    queryKey: detailKey,
    queryFn: async () => {
      const conversationRes = await api.inbox.getConversation(conversationId)
      const detail = unwrapSingle<InboxConversation>(conversationRes.data)
      if (!detail) {
        throw new Error(t('thread.errors.notFound'))
      }
      return detail
    },
    enabled: detailsEnabled,
    staleTime: 15_000,
  })

  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: async () => {
      const membersRes = await api.members.list()
      return unwrapMembers(membersRes.data)
    },
    enabled: detailsEnabled,
    staleTime: 60_000,
  })

  const whatsappQuery = useWhatsappConfigs({
    enabled: detailsEnabled && canViewWhatsapp,
  })

  const localConversation = conversationQuery.data ?? null
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const whatsappConfigs = useMemo(
    () => whatsappQuery.data?.configs ?? [],
    [whatsappQuery.data?.configs]
  )
  const loading = conversationQuery.isLoading || orgsLoading
  const error = conversationQuery.error
    ? (conversationQuery.error as unknown as ApiError).message || t('thread.errors.loadFailed')
    : null

  // Seed inbox context from query cache without fighting Thread SSE merges.
  if (inboxConversationId !== conversationId) {
    setInboxConversationId(conversationId)
    setInboxConversation(null)
  } else if (localConversation && !inboxConversation) {
    setInboxConversation(localConversation)
  }
  if (membersQuery.isSuccess && inboxMembers !== members) {
    setInboxMembers(members)
  }

  const conversation =
    inboxConversationId === conversationId && inboxConversation
      ? inboxConversation
      : localConversation

  const detailsTab = tabState.conversationId === conversationId ? tabState.tab : 'info'
  const whatsappConfigId = conversation?.whatsappConfigId ?? null
  const assignedAgentId = conversation?.assignedAgentId ?? null

  const agentNameByUserId = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of inboxMembers) {
      map.set(member.userId, member.name || member.email)
    }
    return map
  }, [inboxMembers])

  const whatsappLabel = useMemo(() => {
    if (!whatsappConfigId) return null
    const match = whatsappConfigs.find((cfg) => cfg.id === whatsappConfigId)
    if (!match) return whatsappConfigId
    return match.displayPhoneNumber?.trim() || match.phoneNumberId || whatsappConfigId
  }, [whatsappConfigId, whatsappConfigs])

  const agentLabel = useMemo(() => {
    if (!assignedAgentId) return t('unassigned')
    return agentNameByUserId.get(assignedAgentId) ?? assignedAgentId.slice(0, 8)
  }, [agentNameByUserId, assignedAgentId, t])

  const statusLabel = conversation
    ? ['open', 'pending', 'closed'].includes(conversation.status)
      ? t(`filters.status.${conversation.status as InboxConversationStatus}`)
      : conversation.status
    : ''

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden',
        'border border-dash-border bg-canvas/95 shadow-[0_1px_3px_rgb(15_23_42/0.06)]',
        'rounded-[18px]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-dash-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">
            {tDetails('title')}
          </h2>
          <p className="mt-0.5 text-xs text-mute">{tDetails('subtitle')}</p>
        </div>
        {onClosePanel ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={onClosePanel}
            aria-label={tDetails('closePanel')}
          >
            <PanelRightClose className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label={tDetails('tabsLabel')}
        className="flex shrink-0 gap-1 border-b border-dash-border px-3 pt-2"
      >
        {(
          [
            { id: 'info' as const, label: tDetails('tabs.info') },
            { id: 'notes' as const, label: tDetails('tabs.notes') },
          ] as const
        ).map((tab) => {
          const selected = detailsTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                'rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                selected ? 'border-b-2 border-primary text-ink' : 'text-mute hover:text-ink'
              )}
              onClick={() => setTabState({ conversationId, tab: tab.id })}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {detailsTab === 'notes' ? (
        <InboxThreadNotes conversationId={conversationId} active />
      ) : loading || orgsLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 px-4 py-10 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {tDetails('loading')}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void conversationQuery.refetch()
              void membersQuery.refetch()
            }}
          >
            {t('retry')}
          </Button>
        </div>
      ) : !conversation ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <StickyNote className="size-5 text-mute" aria-hidden />
          <p className="text-sm text-mute">{tDetails('empty')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-mute uppercase">
              {tDetails('contactTitle')}
            </h3>
            <dl className="space-y-2.5 rounded-2xl border border-dash-border bg-dash-surface/40 p-3.5">
              <DetailRow
                label={tDetails('fields.name')}
                value={conversation.contact?.name?.trim() || null}
              />
              <DetailRow
                label={tDetails('fields.phone')}
                value={conversation.contact?.phone || null}
              />
              <DetailRow
                label={tDetails('fields.email')}
                value={conversation.contact?.email?.trim() || null}
              />
              <DetailRow
                label={tDetails('fields.company')}
                value={conversation.contact?.company?.trim() || null}
              />
            </dl>
          </section>

          <section className="mt-5 space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-mute uppercase">
              {tDetails('conversationTitle')}
            </h3>
            <dl className="space-y-2.5 rounded-2xl border border-dash-border bg-dash-surface/40 p-3.5">
              <DetailRow label={tDetails('fields.status')} value={statusLabel} />
              <DetailRow
                label={tDetails('fields.aiMode')}
                value={<InboxAiModePill conversation={conversation} />}
              />
              <DetailRow label={tDetails('fields.assignedTo')} value={agentLabel} />
              <DetailRow label={tDetails('fields.whatsappConfig')} value={whatsappLabel} />
              <DetailRow
                label={tDetails('fields.unreadCount')}
                value={
                  typeof conversation.unreadCount === 'number'
                    ? String(conversation.unreadCount)
                    : null
                }
              />
              <DetailRow
                label={tDetails('fields.createdAt')}
                value={formatMessageTime(conversation.createdAt)}
              />
              <DetailRow
                label={tDetails('fields.updatedAt')}
                value={formatMessageTime(
                  conversation.updatedAt || conversation.lastMessageAt || null
                )}
              />
              <DetailRow
                label={tDetails('fields.firstResponseAt')}
                value={formatMessageTime(conversation.firstResponseAt)}
              />
              <DetailRow
                label={tDetails('fields.closedAt')}
                value={formatMessageTime(conversation.closedAt)}
              />
            </dl>
          </section>
        </div>
      )}
    </aside>
  )
}

export function InboxDetailsEmpty({ className }: { className?: string }) {
  const t = useTranslations('dashboard.inbox.details')

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full flex-col items-center justify-center gap-2',
        'rounded-[18px] border border-dash-border bg-canvas/95 px-4 py-10 text-center',
        'shadow-[0_1px_3px_rgb(15_23_42/0.06)]',
        className
      )}
    >
      <p className="text-sm font-semibold text-ink">{t('emptyTitle')}</p>
      <p className="max-w-[14rem] text-xs leading-5 text-mute">{t('emptyDescription')}</p>
    </aside>
  )
}
