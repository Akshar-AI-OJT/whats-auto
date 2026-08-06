'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type InboxConversation,
  type OrganizationMember,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'
import {
  contactInitials,
  contactLabel,
  formatRelativeListTime,
  unwrapPaginated,
} from './inbox-utils'

const SIDEBAR_LIMIT = 30

function unwrapMembers(data: unknown): OrganizationMember[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: OrganizationMember[] }).data
  }
  return []
}

type InboxConversationListSidebarProps = {
  selectedConversationId?: string
}

export function InboxConversationListSidebar({
  selectedConversationId,
}: InboxConversationListSidebarProps) {
  const t = useTranslations('dashboard.inbox')
  const { tenantOrganizationId, canViewInbox, isLoading: orgsLoading } = useOrganizations()

  const [conversations, setConversations] = useState<InboxConversation[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(true)

  const organizationIdRef = useRef(tenantOrganizationId)
  organizationIdRef.current = tenantOrganizationId

  const agentNameByUserId = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) {
      map.set(member.userId, member.name || member.email)
    }
    return map
  }, [members])

  const loadSidebar = useCallback(async (organizationId: string) => {
    if (!canViewInbox) {
      setConversations([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [conversationsRes, membersRes] = await Promise.all([
        api.inbox.listConversations({ page: 1, limit: SIDEBAR_LIMIT }),
        api.members.list(),
      ])
      if (organizationId !== organizationIdRef.current) return

      const { items } = unwrapPaginated<InboxConversation>(conversationsRes.data)
      setConversations(items)
      setMembers(unwrapMembers(membersRes.data))
    } catch {
      if (organizationId !== organizationIdRef.current) return
      setConversations([])
    } finally {
      if (organizationId === organizationIdRef.current) {
        setLoading(false)
      }
    }
  }, [canViewInbox])

  useEffect(() => {
    if (orgsLoading) return
    if (!tenantOrganizationId) {
      setConversations([])
      setLoading(true)
      return
    }
    void loadSidebar(tenantOrganizationId)
  }, [orgsLoading, tenantOrganizationId, loadSidebar])

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full flex-col',
        'border border-dash-border bg-canvas/95 shadow-[0_1px_3px_rgb(15_23_42/0.06)]',
        'rounded-[18px] lg:rounded-r-none lg:border-r-0',
        'lg:w-[20rem] lg:shrink-0 xl:w-[22rem]'
      )}
    >
      <div className="border-b border-dash-border px-4 py-3">
        <h2 className="font-display text-sm font-semibold tracking-tight text-ink">
          {t('listTitle')}
        </h2>
        <p className="mt-0.5 text-xs text-mute">{t('sidebarDescription')}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading || orgsLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mute">{t('emptyTitle')}</p>
        ) : (
          <ul>
            {conversations.map((conversation) => {
              const isSelected = conversation.id === selectedConversationId
              const updated =
                conversation.lastMessageAt ||
                conversation.updatedAt ||
                conversation.createdAt
              const agentLabel = conversation.assignedAgentId
                ? (agentNameByUserId.get(conversation.assignedAgentId) ?? t('unassigned'))
                : t('unassigned')

              return (
                <li key={conversation.id}>
                  <Link
                    href={`/dashboard/inbox/${conversation.id}`}
                    className={cn(
                      'flex gap-2.5 border-b border-dash-border/80 px-3.5 py-2.5 transition-colors',
                      'hover:bg-primary-pale/20',
                      isSelected && 'border-l-2 border-l-primary bg-primary-pale/35 pl-[calc(0.875rem-2px)]'
                    )}
                    aria-current={isSelected ? 'page' : undefined}
                  >
                    <WorkspaceAvatar
                      initials={contactInitials(conversation)}
                      size="md"
                      className="rounded-lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ink">
                          {contactLabel(conversation)}
                        </p>
                        <span className="shrink-0 text-[11px] tabular-nums text-mute">
                          {formatRelativeListTime(updated)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-mute">
                        {conversation.lastMessageText?.trim() || t('noPreview')}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-body">
                        {agentLabel}
                      </p>
                    </div>
                    {conversation.unreadCount > 0 ? (
                      <span className="mt-1 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-on-primary tabular-nums">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
