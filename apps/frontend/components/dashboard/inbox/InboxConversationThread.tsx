'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import {
  api,
  type ApiError,
  type InboxConversation,
  type InboxMessage,
  type OrganizationMember,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { InboxConversationHeader } from './InboxConversationHeader'
import { InboxMessageList } from './InboxMessageList'
import { InboxReplyComposer } from './InboxReplyComposer'
import {
  InboxThreadHeaderSkeleton,
  InboxThreadMessagesSkeleton,
} from './InboxThreadSkeleton'
import { useInboxWorkspace } from './InboxWorkspaceContext'
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
  const { tenantOrganizationId, canViewInbox, isLoading: orgsLoading } = useOrganizations()
  const workspace = useInboxWorkspace()

  const [conversation, setConversation] = useState<InboxConversation | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [conversationLoading, setConversationLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const organizationIdRef = useRef(tenantOrganizationId)
  const conversationIdRef = useRef(conversationId)
  organizationIdRef.current = tenantOrganizationId
  conversationIdRef.current = conversationId

  const setWorkspaceConversation = workspace.setConversation
  const setWorkspaceConversationId = workspace.setConversationId
  const setWorkspaceMembers = workspace.setMembers
  const mergeWorkspaceConversation = workspace.mergeConversation

  const agentNameByUserId = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) {
      map.set(member.userId, member.name || member.email)
    }
    return map
  }, [members])

  const loadThread = useCallback(
    async (organizationId: string, activeConversationId: string) => {
      if (!canViewInbox) {
        setConversation(null)
        setMessages([])
        setConversationLoading(false)
        setMessagesLoading(false)
        return
      }

      setConversationLoading(true)
      setMessagesLoading(true)
      setError(null)
      setConversation(null)
      setMessages([])
      setWorkspaceConversationId(activeConversationId)
      setWorkspaceConversation(null)

      try {
        const [conversationRes, membersRes, messageItems] = await Promise.all([
          api.inbox.getConversation(activeConversationId),
          api.members.list(),
          fetchAllMessages(activeConversationId),
        ])

        if (
          organizationId !== organizationIdRef.current ||
          activeConversationId !== conversationIdRef.current
        ) {
          return
        }

        const detail = unwrapSingle<InboxConversation>(conversationRes.data)
        if (!detail) {
          setError(t('errors.notFound'))
          return
        }

        const nextMembers = unwrapMembers(membersRes.data)
        setConversation(detail)
        setMembers(nextMembers)
        setMessages(messageItems)
        setWorkspaceConversation(detail)
        setWorkspaceMembers(nextMembers)
      } catch (err) {
        if (
          organizationId !== organizationIdRef.current ||
          activeConversationId !== conversationIdRef.current
        ) {
          return
        }
        setError((err as ApiError).message || t('errors.loadFailed'))
      } finally {
        if (
          organizationId === organizationIdRef.current &&
          activeConversationId === conversationIdRef.current
        ) {
          setConversationLoading(false)
          setMessagesLoading(false)
        }
      }
    },
    [
      canViewInbox,
      setWorkspaceConversation,
      setWorkspaceConversationId,
      setWorkspaceMembers,
      t,
    ]
  )

  useEffect(() => {
    if (orgsLoading) return
    if (!tenantOrganizationId) return
    void loadThread(tenantOrganizationId, conversationId)
  }, [orgsLoading, tenantOrganizationId, conversationId, loadThread])

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
      const messageItems = await fetchAllMessages(conversationId)
      if (conversationIdRef.current !== conversationId) return
      setMessages(messageItems)
      // Refresh conversation for unread/last message fields
      const res = await api.inbox.getConversation(conversationId)
      const detail = unwrapSingle<InboxConversation>(res.data)
      if (detail && conversationIdRef.current === conversationId) {
        setConversation((prev) => (prev ? mergeConversationUpdate(prev, detail) : detail))
        setWorkspaceConversation(detail)
      }
    } catch {
      // Keep existing messages; composer surfaces send errors via toast.
    }
  }, [canViewInbox, conversationId, setWorkspaceConversation, tenantOrganizationId])

  const handleRetry = () => {
    if (tenantOrganizationId) {
      void loadThread(tenantOrganizationId, conversationId)
    }
  }

  const handleConversationUpdated = useCallback(
    (patch: Partial<InboxConversation>) => {
      setConversation((prev) => (prev ? mergeConversationUpdate(prev, patch) : prev))
      mergeWorkspaceConversation(patch)
    },
    [mergeWorkspaceConversation]
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
              onSent={refreshMessages}
            />
          </div>
        </>
      ) : null}
    </DashboardPanel>
  )
}
