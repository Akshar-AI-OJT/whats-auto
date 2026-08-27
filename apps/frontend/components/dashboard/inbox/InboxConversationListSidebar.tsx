'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { Link, useRouter } from '@/i18n/navigation'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'
import { InboxNewConversationSheet } from './InboxNewConversationSheet'
import { InboxAiModePill } from './InboxAiModePill'
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

type InboxListData = {
  items: InboxConversation[]
  meta: PaginationMeta | null
}

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
  const queryClient = useQueryClient()
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

  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [newOpen, setNewOpen] = useState(false)
  const [hasDeferredNewActivity, setHasDeferredNewActivity] = useState(false)

  const searchId = useId()

  const listFilters = useMemo<InboxListFilters>(
    () => ({
      page,
      search,
      status: statusFilter,
      assignedAgentId: agentFilter,
    }),
    [agentFilter, page, search, statusFilter]
  )

  const listKey = queryKeys.inbox.list(tenantOrganizationId, listFilters)

  const listEnabled =
    !orgsLoading && Boolean(tenantOrganizationId) && canViewInbox

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: async (): Promise<InboxListData> => {
      const conversationsRes = await api.inbox.listConversations({
        page,
        limit: PER_PAGE,
        search: search || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        assignedAgentId: agentFilter === 'all' ? undefined : agentFilter,
      })
      const { items, meta } = unwrapPaginated<InboxConversation>(conversationsRes.data)
      return { items, meta }
    },
    enabled: listEnabled,
    staleTime: 15_000,
  })

  const membersQuery = useQuery({
    queryKey: queryKeys.team.members(tenantOrganizationId),
    queryFn: async () => {
      const membersRes = await api.members.list()
      return unwrapMembers(membersRes.data)
    },
    enabled: listEnabled,
    staleTime: 60_000,
  })

  const conversations = useMemo(
    () => listQuery.data?.items ?? [],
    [listQuery.data?.items]
  )
  const meta = listQuery.data?.meta ?? null
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const loading = listQuery.isFetching
  const error = listQuery.error
    ? (listQuery.error as unknown as ApiError).message || t('errors.loadFailed')
    : null

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const fetchAndUpsertConversation = useCallback(
    async (conversationId: string) => {
      if (!canViewInbox || !tenantOrganizationId) return
      try {
        const detail = await queryClient.fetchQuery({
          queryKey: queryKeys.inbox.detail(tenantOrganizationId, conversationId),
          queryFn: async () => {
            const res = await api.inbox.getConversation(conversationId)
            const unwrapped = unwrapSingle<InboxConversation>(res.data)
            if (!unwrapped) throw new Error('not found')
            return unwrapped
          },
          staleTime: 15_000,
        })
        let inserted = false
        queryClient.setQueryData<InboxListData>(listKey, (prev) => {
          if (!prev) return prev
          const nextItems = upsertConversationInList(prev.items, detail, listFilters)
          inserted = nextItems.some((row) => row.id === detail.id)
          return {
            ...prev,
            items: nextItems,
          }
        })
        if (!inserted) {
          setHasDeferredNewActivity(true)
        }
      } catch {
        // Keep the current page; the next refresh or event can retry.
      }
    },
    [canViewInbox, listFilters, listKey, queryClient, tenantOrganizationId]
  )

  useEffect(() => {
    if (!canViewInbox) return
    return subscribeInboxEvents((event) => {
      let fetchConversationId: string | null = null
      let notifyNewActivity = false
      queryClient.setQueryData<InboxListData>(listKey, (prev) => {
        if (!prev) {
          // List not in cache yet — still fetch new conversations so the first
          // inbound after empty/load does not get dropped.
          if (event.type === 'message.received' && listFilters.page === 1) {
            fetchConversationId = event.payload.conversationId
          } else if (
            event.type === 'message.received' ||
            event.type === 'message.queued' ||
            event.type === 'message.sent'
          ) {
            notifyNewActivity = listFilters.page !== 1
          }
          return prev
        }
        const result = applyInboxSseToList(prev.items, event, listFilters)
        fetchConversationId = result.fetchConversationId
        notifyNewActivity = result.notifyNewActivity
        return { ...prev, items: result.conversations }
      })
      if (notifyNewActivity) {
        setHasDeferredNewActivity(true)
      }
      if (fetchConversationId) {
        void fetchAndUpsertConversation(fetchConversationId)
      }
    })
  }, [canViewInbox, fetchAndUpsertConversation, listFilters, listKey, queryClient, subscribeInboxEvents])

  function showLatestConversations() {
    setHasDeferredNewActivity(false)
    setSearchInput('')
    setSearch('')
    setStatusFilter('all')
    setAgentFilter('all')
    setPage(1)
    void queryClient.invalidateQueries({
      queryKey: queryKeys.inbox.lists(tenantOrganizationId),
    })
  }
  const agentNameByUserId = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) {
      map.set(member.userId, member.name || member.email)
    }
    return map
  }, [members])

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
  const listBusy = orgsLoading || !tenantOrganizationId || listQuery.isLoading

  function refreshList() {
    void queryClient.invalidateQueries({ queryKey: listKey })
  }

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
              onClick={refreshList}
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

        {hasDeferredNewActivity ? (
          <button
            type="button"
            onClick={showLatestConversations}
            className={cn(
              'w-full rounded-lg border border-primary/30 bg-primary-pale/70 px-3 py-2',
              'text-left text-xs font-semibold text-positive-deep',
              'transition-colors hover:bg-primary-pale focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-primary/30'
            )}
          >
            {t('newMessagesBanner')}
          </button>
        ) : null}

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
            <Button type="button" variant="outline" size="sm" onClick={refreshList}>
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => p + 1)}
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
          setPage(1)
          void queryClient.invalidateQueries({
            queryKey: queryKeys.inbox.lists(tenantOrganizationId),
          })
        }}
      />
    </aside>
  )
}
