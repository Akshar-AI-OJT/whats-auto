'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Search } from 'lucide-react'
import {
  api,
  type ApiError,
  type InboxConversation,
  type InboxConversationStatus,
  type OrganizationMember,
  type PaginationMeta,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { Link, useRouter } from '@/i18n/navigation'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'
import { InboxNewConversationSheet } from './InboxNewConversationSheet'
import { InboxAiModePill } from './InboxAiModePill'
import { useLatestRef } from '@/hooks/useLatestRef'
import { useInboxWorkspace } from './InboxWorkspaceContext'
import {
  applyInboxSseToList,
  upsertConversationInList,
  type InboxListFilters,
} from './apply-inbox-sse'
import {
  contactInitials,
  contactLabel,
  formatRelativeListTime,
  unwrapPaginated,
  unwrapSingle,
  mergeConversationUpdate,
} from './inbox-utils'

const PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 350

type StatusFilter = 'all' | InboxConversationStatus

const selectClassName = cn(
  'h-9 w-full min-w-0 rounded-lg border border-dash-border bg-canvas px-2.5 text-xs text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

function unwrapMembers(data: unknown): OrganizationMember[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: OrganizationMember[] }).data
  }
  return []
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'open'
      ? 'bg-primary-pale text-positive-deep ring-primary/25'
      : status === 'pending'
        ? 'bg-dash-surface text-ink ring-dash-border'
        : 'bg-mute/15 text-mute ring-dash-border'

  return (
    <span
      className={cn('inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1', tone)}
    >
      {label}
    </span>
  )
}

type InboxConversationListSidebarProps = {
  selectedConversationId?: string
  variant?: 'panel' | 'page'
}

export function InboxConversationListSidebar({
  selectedConversationId,
  variant = 'panel',
}: InboxConversationListSidebarProps) {
  const t = useTranslations('dashboard.inbox')
  const router = useRouter()
  const {
    tenantOrganizationId,
    canViewInbox,
    permissions,
    isLoading: orgsLoading,
  } = useOrganizations()
  const { subscribeInboxEvents, conversation: workspaceConversation } = useInboxWorkspace()

  const canCreate =
    hasPermission(permissions, PERMISSIONS.INBOX_VIEW) &&
    hasPermission(permissions, PERMISSIONS.CONTACTS_VIEW) &&
    hasPermission(permissions, PERMISSIONS.WHATSAPP_VIEW)

  const [conversations, setConversations] = useState<InboxConversation[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [newOpen, setNewOpen] = useState(false)

  const organizationIdRef = useLatestRef(tenantOrganizationId)
  const filtersRef = useLatestRef<InboxListFilters>({
    page,
    search,
    status: statusFilter,
    assignedAgentId: agentFilter,
  })
  const inflightConversationFetches = useRef(new Set<string>())
  const searchId = useId()

  const agentNameByUserId = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) {
      map.set(member.userId, member.name || member.email)
    }
    return map
  }, [members])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const loadList = useCallback(
    async (organizationId: string, nextPage: number) => {
      if (!canViewInbox) {
        setConversations([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const [conversationsRes, membersRes] = await Promise.all([
          api.inbox.listConversations({
            page: nextPage,
            limit: PER_PAGE,
            search: search || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
            assignedAgentId: agentFilter === 'all' ? undefined : agentFilter,
          }),
          api.members.list(),
        ])
        if (organizationId !== organizationIdRef.current) return

        const { items, meta: nextMeta } = unwrapPaginated<InboxConversation>(conversationsRes.data)
        setConversations(items)
        setMeta(nextMeta)
        setPage(nextMeta?.currentPage ?? nextPage)
        setMembers(unwrapMembers(membersRes.data))
      } catch (err) {
        if (organizationId !== organizationIdRef.current) return
        setConversations([])
        setMeta(null)
        setError((err as ApiError).message || t('errors.loadFailed'))
      } finally {
        if (organizationId === organizationIdRef.current) {
          setLoading(false)
        }
      }
    },
    [agentFilter, canViewInbox, organizationIdRef, search, statusFilter, t]
  )

  useEffect(() => {
    if (orgsLoading || !tenantOrganizationId) return
    let cancelled = false
    const scheduled = Promise.resolve().then(() => {
      if (cancelled) return
      return loadList(tenantOrganizationId, page)
    })
    return () => {
      cancelled = true
      void scheduled
    }
  }, [orgsLoading, tenantOrganizationId, loadList, page])

  const fetchAndUpsertConversation = useCallback(
    async (conversationId: string) => {
      if (!canViewInbox) return
      if (inflightConversationFetches.current.has(conversationId)) return
      inflightConversationFetches.current.add(conversationId)
      try {
        const res = await api.inbox.getConversation(conversationId)
        if (organizationIdRef.current !== tenantOrganizationId) return
        const detail = unwrapSingle<InboxConversation>(res.data)
        if (!detail) return
        setConversations((prev) => upsertConversationInList(prev, detail, filtersRef.current))
      } catch {
        // Keep the current page; the next refresh or event can retry.
      } finally {
        inflightConversationFetches.current.delete(conversationId)
      }
    },
    [canViewInbox, filtersRef, organizationIdRef, tenantOrganizationId]
  )

  useEffect(() => {
    if (!canViewInbox) return
    return subscribeInboxEvents((event) => {
      let fetchConversationId: string | null = null
      setConversations((prev) => {
        const result = applyInboxSseToList(prev, event, filtersRef.current)
        fetchConversationId = result.fetchConversationId
        return result.conversations
      })
      if (fetchConversationId) {
        void fetchAndUpsertConversation(fetchConversationId)
      }
    })
  }, [canViewInbox, fetchAndUpsertConversation, filtersRef, subscribeInboxEvents])

  const lastPage = meta?.lastPage ?? 1
  const visibleConversations = useMemo(() => {
    const base = tenantOrganizationId ? conversations : []
    if (!workspaceConversation) return base
    return base.map((row) =>
      row.id === workspaceConversation.id
        ? mergeConversationUpdate(row, {
            aiMode: workspaceConversation.aiMode,
            aiHandoverReason: workspaceConversation.aiHandoverReason,
          })
        : row
    )
  }, [conversations, tenantOrganizationId, workspaceConversation])
  const total = meta?.total ?? visibleConversations.length
  const listBusy = orgsLoading || !tenantOrganizationId || loading

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden',
        'border border-dash-border bg-canvas/95 shadow-[0_1px_3px_rgb(15_23_42/0.06)]',
        variant === 'panel'
          ? 'rounded-[18px] lg:rounded-r-none lg:border-r-0 lg:w-[20rem] lg:shrink-0 xl:w-[22rem]'
          : 'rounded-[18px]'
      )}
    >
      <div className="shrink-0 space-y-3 border-b border-dash-border px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold tracking-tight text-ink">
              {t('listTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-mute">{t('listDescription', { count: total })}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={listBusy}
              onClick={() => {
                if (tenantOrganizationId) void loadList(tenantOrganizationId, page)
              }}
              aria-label={t('refresh')}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden />
            </Button>
            {canCreate ? (
              <Button
                type="button"
                size="icon-sm"
                onClick={() => setNewOpen(true)}
                aria-label={t('newConversationCta')}
              >
                <Plus className="size-3.5" aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-mute"
            aria-hidden
          />
          <Input
            id={searchId}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
            className="h-9 rounded-lg border-dash-border pl-8 text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${searchId}-status`} className="sr-only">
              {t('statusFilterLabel')}
            </label>
            <select
              id={`${searchId}-status`}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter)
                setPage(1)
              }}
              className={selectClassName}
            >
              <option value="all">{t('filters.status.all')}</option>
              <option value="open">{t('filters.status.open')}</option>
              <option value="pending">{t('filters.status.pending')}</option>
              <option value="closed">{t('filters.status.closed')}</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${searchId}-agent`} className="sr-only">
              {t('agentFilterLabel')}
            </label>
            <select
              id={`${searchId}-agent`}
              value={agentFilter}
              onChange={(e) => {
                setAgentFilter(e.target.value)
                setPage(1)
              }}
              className={selectClassName}
            >
              <option value="all">{t('filters.agent.all')}</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name?.trim() || member.email}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {listBusy ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (tenantOrganizationId) void loadList(tenantOrganizationId, page)
              }}
            >
              {t('retry')}
            </Button>
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-ink">{t('emptyTitle')}</p>
            <p className="mt-1 text-xs leading-5 text-mute">{t('emptyDescription')}</p>
          </div>
        ) : (
          <ul>
            {visibleConversations.map((conversation) => {
              const isSelected = conversation.id === selectedConversationId
              const updated =
                conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt
              const agentLabel = conversation.assignedAgentId
                ? (agentNameByUserId.get(conversation.assignedAgentId) ?? t('unassigned'))
                : t('unassigned')
              const statusLabel = ['open', 'pending', 'closed'].includes(conversation.status)
                ? t(`filters.status.${conversation.status as InboxConversationStatus}`)
                : conversation.status

              return (
                <li key={conversation.id}>
                  <Link
                    href={`/dashboard/inbox/${conversation.id}`}
                    className={cn(
                      'flex gap-2.5 border-b border-dash-border/80 px-3.5 py-2.5 transition-colors',
                      'hover:bg-primary-pale/20',
                      isSelected &&
                        'border-l-2 border-l-primary bg-primary-pale/35 pl-[calc(0.875rem-2px)]'
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
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={conversation.status} label={statusLabel} />
                        <InboxAiModePill conversation={conversation} size="sm" />
                        <span className="truncate text-[11px] text-body">{agentLabel}</span>
                      </div>
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

      {lastPage > 1 ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-dash-border px-3 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={page <= 1 || loading}
            onClick={() => {
              if (tenantOrganizationId) void loadList(tenantOrganizationId, page - 1)
            }}
            aria-label={t('prevPage')}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <p className="text-[11px] tabular-nums text-mute">
            {t('pagination', { page, lastPage, total })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={page >= lastPage || loading}
            onClick={() => {
              if (tenantOrganizationId) void loadList(tenantOrganizationId, page + 1)
            }}
            aria-label={t('nextPage')}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}

      <InboxNewConversationSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(conversationId) => {
          router.push(`/dashboard/inbox/${conversationId}`)
          if (tenantOrganizationId) void loadList(tenantOrganizationId, 1)
        }}
      />
    </aside>
  )
}
