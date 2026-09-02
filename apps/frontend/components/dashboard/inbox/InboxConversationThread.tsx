'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import {
  api,
  type ApiError,
  type InboxConversation,
  type InboxMessage,
  type OrganizationMember,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { InboxConversationHeader } from './InboxConversationHeader'
import { InboxMessageList } from './InboxMessageList'
import { InboxReplyComposer } from './InboxReplyComposer'
import { InboxThreadHeaderSkeleton, InboxThreadMessagesSkeleton } from './InboxThreadSkeleton'
import { useInboxOrganization } from './InboxOrganizationContext'
import { applyInboxSseToConversation, applyInboxSseToMessages } from './apply-inbox-sse'
import { contactLabel, unwrapPaginated, unwrapSingle, mergeConversationUpdate } from './inbox-utils'

const MESSAGE_PAGE_LIMIT = 100

function unwrapMembers(data: unknown): OrganizationMember[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: OrganizationMember[] }).data
  }
  return []
}

async function fetchAllMessages(conversationId: string): Promise<InboxMessage[]> {
  const first = await api.inbox.listMessages(conversationId, {
    page: 1,
    limit: MESSAGE_PAGE_LIMIT,
  })
  const { items, meta } = unwrapPaginated<InboxMessage>(first.data)
  const all = [...items]

  const lastPage = meta?.lastPage ?? 1
  if (lastPage <= 1) return all

  for (let page = 2; page <= lastPage; page += 1) {
    const { data } = await api.inbox.listMessages(conversationId, {
      page,
      limit: MESSAGE_PAGE_LIMIT,
    })
    const next = unwrapPaginated<InboxMessage>(data)
    all.push(...next.items)
  }

  return all
}

type InboxConversationThreadProps = {
  conversationId: string
  showMobileBack?: boolean
}

export function InboxConversationThread({
  conversationId,
  showMobileBack = true,
}: InboxConversationThreadProps) {
  const t = useTranslations('dashboard.inbox.thread')
  const tInbox = useTranslations('dashboard.inbox')
  const queryClient = useQueryClient()
  const { tenantOrganizationId, canViewInbox, isLoading: orgsLoading } = useOrganizations()
  const inbox = useInboxOrganization()
  const subscribeInboxEvents = inbox.subscribeInboxEvents

  const setInboxConversation = inbox.setConversation
  const setInboxConversationId = inbox.setConversationId
  const setInboxMembers = inbox.setMembers
  const mergeInboxConversation = inbox.mergeConversation

  const threadEnabled =
    !orgsLoading && Boolean(tenantOrganizationId) && canViewInbox && Boolean(conversationId)

  const detailKey = queryKeys.inbox.detail(tenantOrganizationId, conversationId)
  const messagesKey = queryKeys.inbox.messages(tenantOrganizationId, conversationId)
  const membersKey = queryKeys.team.members(tenantOrganizationId)

  const conversationQuery = useQuery({
    queryKey: detailKey,
    queryFn: async () => {
      const conversationRes = await api.inbox.getConversation(conversationId)
      const detail = unwrapSingle<InboxConversation>(conversationRes.data)
      if (!detail) {
        throw new Error(t('errors.notFound'))
      }
      return detail
    },
    enabled: threadEnabled,
    staleTime: 15_000,
  })

  const messagesQuery = useQuery({
    queryKey: messagesKey,
    queryFn: () => fetchAllMessages(conversationId),
    enabled: threadEnabled,
    staleTime: 10_000,
  })

  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: async () => {
      const membersRes = await api.members.list()
      return unwrapMembers(membersRes.data)
    },
    enabled: threadEnabled,
    staleTime: 60_000,
  })

  const conversation = conversationQuery.data ?? null
  const messages = messagesQuery.data ?? []
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const conversationLoading = conversationQuery.isLoading || orgsLoading
  const messagesLoading = messagesQuery.isLoading
  const error = conversationQuery.error
    ? (conversationQuery.error as unknown as ApiError).message || t('errors.loadFailed')
    : null

  // Keep inbox context in sync with the active thread (render-phase adjust).
  const inboxConversationId = inbox.conversationId
  if (inboxConversationId !== conversationId) {
    setInboxConversationId(conversationId)
    setInboxConversation(null)
  } else if (conversation && inbox.conversation !== conversation) {
    setInboxConversation(conversation)
  }
  if (membersQuery.isSuccess && inbox.members !== members) {
    setInboxMembers(members)
  }

  const agentNameByUserId = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) {
      map.set(member.userId, member.name || member.email)
    }
    return map
  }, [members])

  const agentLabel = useMemo(() => {
    if (!conversation?.assignedAgentId) {
      return tInbox('unassigned')
    }
    return (
      agentNameByUserId.get(conversation.assignedAgentId) ??
      conversation.assignedAgentId.slice(0, 8)
    )
  }, [agentNameByUserId, conversation, tInbox])

  const contactName = conversation ? contactLabel(conversation) : ''

  const refreshMessages = useCallback(async () => {
    if (!tenantOrganizationId || !canViewInbox) return
    try {
      const [, detailResult] = await Promise.all([
        queryClient.refetchQueries({ queryKey: messagesKey }),
        queryClient.fetchQuery({
          queryKey: detailKey,
          queryFn: async () => {
            const res = await api.inbox.getConversation(conversationId)
            const detail = unwrapSingle<InboxConversation>(res.data)
            if (!detail) throw new Error('not found')
            return detail
          },
        }),
      ])
      setInboxConversation(detailResult)
    } catch {
      // Keep existing messages; composer surfaces send errors via toast.
    }
  }, [
    canViewInbox,
    conversationId,
    detailKey,
    messagesKey,
    queryClient,
    setInboxConversation,
    tenantOrganizationId,
  ])

  const handleSent = useCallback(
    async (sent?: InboxMessage | null) => {
      if (sent) {
        queryClient.setQueryData<InboxMessage[]>(messagesKey, (prev) => {
          if (!prev) return [sent]
          if (prev.some((message) => message.id === sent.id)) return prev
          return [...prev, sent]
        })
        const patch: Partial<InboxConversation> = {
          lastMessageText: sent.contentText,
          lastMessageAt: sent.createdAt,
          unreadCount: 0,
          updatedAt: sent.createdAt,
        }
        queryClient.setQueryData<InboxConversation>(detailKey, (prev) =>
          prev ? mergeConversationUpdate(prev, patch) : prev
        )
        mergeInboxConversation(patch)
        return
      }
      await refreshMessages()
    },
    [detailKey, mergeInboxConversation, messagesKey, queryClient, refreshMessages]
  )

  useEffect(() => {
    if (!canViewInbox) return
    return subscribeInboxEvents((event) => {
      if (event.payload.conversationId !== conversationId) return

      let missingMessage = false
      let conversationPatch: InboxConversation | null = null

      queryClient.setQueryData<InboxMessage[]>(messagesKey, (prev) => {
        const result = applyInboxSseToMessages(prev ?? [], event, conversationId)
        missingMessage = result.missingMessage
        return result.messages
      })

      queryClient.setQueryData<InboxConversation>(detailKey, (prev) => {
        if (!prev) return prev
        const next = applyInboxSseToConversation(prev, event)
        if (next !== prev) conversationPatch = next
        return next
      })

      if (conversationPatch) {
        mergeInboxConversation(conversationPatch)
      }

      if (missingMessage) {
        void refreshMessages()
      }
    })
  }, [
    canViewInbox,
    conversationId,
    detailKey,
    mergeInboxConversation,
    messagesKey,
    queryClient,
    refreshMessages,
    subscribeInboxEvents,
  ])

  const handleRetry = () => {
    void conversationQuery.refetch()
    void messagesQuery.refetch()
    void membersQuery.refetch()
  }

  const handleConversationUpdated = useCallback(
    (patch: Partial<InboxConversation>) => {
      queryClient.setQueryData<InboxConversation>(detailKey, (prev) =>
        prev ? mergeConversationUpdate(prev, patch) : prev
      )
      mergeInboxConversation(patch)
    },
    [detailKey, mergeInboxConversation, queryClient]
  )

  if (!orgsLoading && !canViewInbox) {
    return (
      <DashboardPanel className="px-4 py-5">
        <p role="alert" className="text-sm text-negative">
          {tInbox('errors.permissionDenied')}
        </p>
      </DashboardPanel>
    )
  }

  return (
    <DashboardPanel
      as="section"
      className={cn(
        'flex h-full min-h-[24rem] flex-col overflow-hidden rounded-[18px]',
        'border border-dash-border shadow-[0_1px_3px_rgb(15_23_42/0.06)]',
        'lg:rounded-l-none'
      )}
    >
      {showMobileBack ? (
        <div className="border-b border-dash-border px-4 py-2.5 lg:hidden">
          <Link
            href="/dashboard/inbox"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-mute',
              'transition-colors hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
            )}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('back')}
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
            {tInbox('retry')}
          </Button>
        </div>
      ) : conversationLoading ? (
        <>
          <InboxThreadHeaderSkeleton />
          <div className="min-h-0 flex-1 overflow-hidden">
            <InboxThreadMessagesSkeleton />
          </div>
        </>
      ) : conversation ? (
        <>
          <InboxConversationHeader
            conversation={conversation}
            agentLabel={agentLabel}
            members={members}
            onConversationUpdated={handleConversationUpdated}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <InboxMessageList
              messages={messages}
              contactName={contactName}
              loading={messagesLoading}
            />
            <InboxReplyComposer
              conversationId={conversationId}
              conversationStatus={conversation.status}
              onSent={handleSent}
            />
          </div>
        </>
      ) : null}
    </DashboardPanel>
  )
}
