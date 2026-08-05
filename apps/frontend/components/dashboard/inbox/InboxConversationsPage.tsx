'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
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
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'
import { InboxNewConversationSheet } from './InboxNewConversationSheet'

const PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 350

type StatusFilter = 'all' | InboxConversationStatus

const selectClassName = cn(
  'h-9 w-full min-w-0 rounded-lg border border-dash-border bg-canvas px-2.5 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

function unwrapPaginated(payload: unknown): {
  items: InboxConversation[]
  meta: PaginationMeta | null
} {
  if (!payload) return { items: [], meta: null }
  if (Array.isArray(payload)) return { items: payload, meta: null }

  const root = payload as {
    data?: InboxConversation[] | { data?: InboxConversation[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return { items: root.data.data, meta: root.data.meta ?? root.meta ?? null }
  }

  return { items: [], meta: null }
}

function unwrapMembers(data: unknown): OrganizationMember[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: OrganizationMember[] }).data
  }
  return []
}

function contactLabel(conversation: InboxConversation) {
  const name = conversation.contact?.name?.trim()
  if (name) return name
  return conversation.contact?.phone || conversation.contactId
}

function contactInitials(conversation: InboxConversation) {
  const source = contactLabel(conversation)
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase() || '?'
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function isClosedToday(conversation: InboxConversation) {
  if (conversation.status !== 'closed') return false
  const raw = conversation.updatedAt || conversation.lastMessageAt || conversation.createdAt
  if (!raw) return false
  const updated = new Date(raw)
  const today = new Date()
  return (
    updated.getFullYear() === today.getFullYear() &&
    updated.getMonth() === today.getMonth() &&
    updated.getDate() === today.getDate()
  )
}

function InboxKpiCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string
  value: number
  icon: LucideIcon
  loading?: boolean
}) {
  if (loading) {
    return (
      <DashboardPanel
        className="animate-pulse border border-dash-border/80 bg-dash-surface/30 p-3 shadow-none sm:p-3.5"
        aria-hidden
      >
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-dash-border" />
            <div className="h-6 w-10 rounded bg-dash-border" />
          </div>
          <div className="size-9 rounded-lg bg-dash-border" />
        </div>
      </DashboardPanel>
    )
  }

  return (
    <DashboardPanel className="border border-dash-border/80 bg-dash-surface/30 p-3 shadow-none sm:p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-mute">{label}</p>
          <p className="mt-1 font-display text-xl font-semibold tracking-tight text-ink tabular-nums">
            {value}
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-pale text-positive-deep">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
    </DashboardPanel>
  )
}

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

function ConversationTableRow({
  conversation,
  agentNameByUserId,
  onNavigate,
  t,
  zebra,
}: {
  conversation: InboxConversation
  agentNameByUserId: Map<string, string>
  onNavigate: (id: string) => void
  t: ReturnType<typeof useTranslations<'dashboard.inbox'>>
  zebra: boolean
}) {
  const updated =
    conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt
  const agentLabel = conversation.assignedAgentId
    ? (agentNameByUserId.get(conversation.assignedAgentId) ??
      conversation.assignedAgentId.slice(0, 8))
    : t('unassigned')

  return (
    <tr
      role="link"
      tabIndex={0}
      className={cn(
        'cursor-pointer border-b border-dash-border last:border-b-0',
        'transition-colors duration-150 hover:bg-primary-pale/30',
        zebra && 'bg-dash-surface/50'
      )}
      onClick={() => onNavigate(conversation.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onNavigate(conversation.id)
        }
      }}
    >
      <td className="px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <WorkspaceAvatar
            initials={contactInitials(conversation)}
            size="md"
            className="rounded-lg"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              {contactLabel(conversation)}
            </span>
            {conversation.contact?.phone ? (
              <span className="block truncate text-xs text-mute">
                {conversation.contact.phone}
              </span>
            ) : null}
          </span>
          {conversation.unreadCount > 0 ? (
            <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-on-primary tabular-nums">
              {conversation.unreadCount}
            </span>
          ) : null}
        </div>
      </td>
      <td className="max-w-[280px] px-4 py-3">
        <span className="line-clamp-2 text-sm text-body">
          {conversation.lastMessageText?.trim() || t('noPreview')}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          status={conversation.status}
          label={
            ['open', 'pending', 'closed'].includes(conversation.status)
              ? t(`filters.status.${conversation.status as InboxConversationStatus}`)
              : conversation.status
          }
        />
      </td>
      <td className="px-4 py-3 text-sm text-ink">{agentLabel}</td>
      <td className="px-4 py-3 text-sm tabular-nums text-body sm:px-5">
        {formatUpdatedAt(updated)}
      </td>
    </tr>
  )
}

export function InboxConversationsPage() {
  const t = useTranslations('dashboard.inbox')
  const router = useRouter()
  const searchId = useId()
  const statusId = useId()
  const agentId = useId()
  const rowsPerPageId = useId()

  const {
    tenantOrganizationId,
    canViewInbox,
    canViewContacts,
    permissions,
    isLoading: orgsLoading,
  } = useOrganizations()

  const canViewWhatsapp = hasPermission(permissions, PERMISSIONS.WHATSAPP_VIEW)

  const [conversations, setConversations] = useState<InboxConversation[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [assignedAgentId, setAssignedAgentId] = useState('all')
  const [newConversationOpen, setNewConversationOpen] = useState(false)

  const organizationIdRef = useRef(tenantOrganizationId)
  organizationIdRef.current = tenantOrganizationId

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const agentNameByUserId = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) {
      map.set(member.userId, member.name || member.email)
    }
    return map
  }, [members])

  const kpiStats = useMemo(
    () => ({
      open: conversations.filter((c) => c.status === 'open').length,
      assigned: conversations.filter((c) => Boolean(c.assignedAgentId)).length,
      waiting: conversations.filter((c) => c.status === 'pending').length,
      closedToday: conversations.filter(isClosedToday).length,
    }),
    [conversations]
  )

  const loadMembers = useCallback(async (organizationId: string) => {
    try {
      const { data } = await api.members.list()
      if (organizationId !== organizationIdRef.current) return
      setMembers(unwrapMembers(data))
    } catch {
      if (organizationId !== organizationIdRef.current) return
      setMembers([])
    }
  }, [])

  const loadConversations = useCallback(
    async (organizationId: string, nextPage: number) => {
      if (!canViewInbox) {
        setConversations([])
        setListLoading(false)
        return
      }

      setListLoading(true)
      setListError(null)
      try {
        const { data } = await api.inbox.listConversations({
          page: nextPage,
          limit: PER_PAGE,
          status: statusFilter === 'all' ? undefined : statusFilter,
          assignedAgentId: assignedAgentId === 'all' ? undefined : assignedAgentId,
          search: debouncedSearch || undefined,
        })
        if (organizationId !== organizationIdRef.current) return

        const { items, meta } = unwrapPaginated(data)
        setConversations(items)
        setPage(meta?.currentPage ?? nextPage)
        setLastPage(meta?.lastPage ?? 1)
        setTotal(meta?.total ?? items.length)
      } catch (err) {
        if (organizationId !== organizationIdRef.current) return
        setConversations([])
        setListError((err as ApiError).message || t('errors.loadFailed'))
      } finally {
        if (organizationId === organizationIdRef.current) {
          setListLoading(false)
        }
      }
    },
    [assignedAgentId, canViewInbox, debouncedSearch, statusFilter, t]
  )

  const handleRefresh = useCallback(() => {
    if (tenantOrganizationId) {
      void loadConversations(tenantOrganizationId, page)
    }
  }, [loadConversations, page, tenantOrganizationId])

  const handleNavigate = useCallback(
    (id: string) => {
      router.push(`/dashboard/inbox/${id}`)
    },
    [router]
  )

  useEffect(() => {
    if (orgsLoading) return
    if (!tenantOrganizationId) {
      setConversations([])
      setMembers([])
      setListLoading(true)
      setListError(null)
      return
    }
    void loadMembers(tenantOrganizationId)
  }, [orgsLoading, tenantOrganizationId, loadMembers])

  useEffect(() => {
    if (orgsLoading) return
    if (!tenantOrganizationId) return
    void loadConversations(tenantOrganizationId, page)
  }, [
    orgsLoading,
    tenantOrganizationId,
    page,
    statusFilter,
    assignedAgentId,
    debouncedSearch,
    loadConversations,
  ])

  const isPageLoading = listLoading || orgsLoading || !tenantOrganizationId
  const showEmptyState = !isPageLoading && !listError && conversations.length === 0
  const canGoPrev = page > 1
  const canGoNext = page < lastPage

  if (!orgsLoading && !canViewInbox) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <header>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.65rem]">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-mute">{t('subtitle')}</p>
        </header>
        <DashboardPanel as="section" className="px-4 py-4 sm:px-5">
          <p role="alert" className="text-sm text-negative">
            {t('errors.permissionDenied')}
          </p>
        </DashboardPanel>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 lg:h-[calc(100dvh-7.5rem)] lg:min-h-0 lg:gap-6">
      <header className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.65rem]">
            {t('title')}
          </h1>
          <p className="mt-0.5 max-w-xl text-sm leading-5 text-mute">{t('subtitle')}</p>
        </div>

        {canViewInbox && canViewContacts && canViewWhatsapp ? (
          <div className="sm:ml-auto">
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => setNewConversationOpen(true)}
              disabled={orgsLoading}
            >
              <Plus className="size-4" aria-hidden />
              {t('newConversationCta')}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        <InboxKpiCard
          label={t('kpis.open')}
          value={kpiStats.open}
          icon={MessageCircle}
          loading={isPageLoading}
        />
        <InboxKpiCard
          label={t('kpis.assigned')}
          value={kpiStats.assigned}
          icon={UserCheck}
          loading={isPageLoading}
        />
        <InboxKpiCard
          label={t('kpis.waiting')}
          value={kpiStats.waiting}
          icon={Clock}
          loading={isPageLoading}
        />
        <InboxKpiCard
          label={t('kpis.closedToday')}
          value={kpiStats.closedToday}
          icon={CheckCircle2}
          loading={isPageLoading}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="shrink-0 text-sm font-medium text-ink">{t('listTitle')}</p>

      <DashboardPanel
        as="section"
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px]',
          'border border-dash-border shadow-[0_1px_3px_rgb(15_23_42/0.06)]'
        )}
      >
        {listError ? (
          <div className="flex flex-col gap-3 border-b border-dash-border bg-negative/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p role="alert" className="text-sm text-negative">
              {listError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleRefresh}>
              {t('retry')}
            </Button>
          </div>
        ) : null}

        <div
          className={cn(
            'sticky top-0 z-10 border-b border-dash-border bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:px-5',
            'supports-[backdrop-filter]:bg-canvas/80'
          )}
        >
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <label htmlFor={searchId} className="sr-only">
                {t('searchLabel')}
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                id={searchId}
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('searchPlaceholder')}
                className="h-9 rounded-lg border-dash-border bg-dash-surface/80 pl-9 text-sm shadow-none"
              />
            </div>

            <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[10rem_11rem_auto] lg:shrink-0">
              <div className="min-w-0">
                <label htmlFor={statusId} className="sr-only">
                  {t('statusFilterLabel')}
                </label>
                <select
                  id={statusId}
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as StatusFilter)
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

              <div className="min-w-0">
                <label htmlFor={agentId} className="sr-only">
                  {t('agentFilterLabel')}
                </label>
                <select
                  id={agentId}
                  value={assignedAgentId}
                  onChange={(event) => {
                    setAssignedAgentId(event.target.value)
                    setPage(1)
                  }}
                  className={selectClassName}
                >
                  <option value="all">{t('filters.agent.all')}</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name || member.email}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0 border-dash-border"
                aria-label={t('refresh')}
                disabled={isPageLoading}
                onClick={handleRefresh}
              >
                <RefreshCw
                  className={cn('size-4', isPageLoading && 'animate-spin')}
                  aria-hidden
                />
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="hidden md:block">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead className="sticky top-0 z-[1] bg-dash-surface/95 backdrop-blur-sm">
                <tr className="border-b border-dash-border">
                  <th className="px-4 py-2.5 text-xs font-semibold tracking-wide text-mute uppercase sm:px-5">
                    {t('columns.contact')}
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('columns.preview')}
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('columns.status')}
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('columns.agent')}
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold tracking-wide text-mute uppercase sm:px-5">
                    {t('columns.updated')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isPageLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center sm:px-5">
                      <div className="flex items-center justify-center gap-2 text-sm text-body">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        {t('loading')}
                      </div>
                    </td>
                  </tr>
                ) : showEmptyState ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 sm:px-5">
                      <div className="flex flex-col items-center justify-center gap-2.5 py-2 text-center">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-pale text-lg text-positive-deep">
                          <Inbox className="size-5" aria-hidden />
                        </span>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-ink">{t('emptyTitle')}</p>
                          <p className="mx-auto max-w-md text-sm leading-5 text-mute">
                            {t('emptyDescription')}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                          <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
                            {t('emptyConnectCta')}
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  conversations.map((conversation, index) => (
                    <ConversationTableRow
                      key={conversation.id}
                      conversation={conversation}
                      agentNameByUserId={agentNameByUserId}
                      onNavigate={handleNavigate}
                      t={t}
                      zebra={index % 2 === 1}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            {isPageLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-body">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t('loading')}
              </div>
            ) : showEmptyState ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
                  <Inbox className="size-5" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ink">{t('emptyTitle')}</p>
                  <p className="text-sm leading-5 text-mute">{t('emptyDescription')}</p>
                </div>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
                    {t('emptyConnectCta')}
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-dash-border">
                {conversations.map((conversation) => {
                  const updated =
                    conversation.lastMessageAt ||
                    conversation.updatedAt ||
                    conversation.createdAt
                  const agentLabel = conversation.assignedAgentId
                    ? (agentNameByUserId.get(conversation.assignedAgentId) ??
                      conversation.assignedAgentId.slice(0, 8))
                    : t('unassigned')

                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3.5 text-left transition-colors hover:bg-primary-pale/25"
                        onClick={() => handleNavigate(conversation.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <WorkspaceAvatar
                              initials={contactInitials(conversation)}
                              size="md"
                              className="rounded-lg"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink">
                                {contactLabel(conversation)}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-mute">
                                {conversation.lastMessageText?.trim() || t('noPreview')}
                              </p>
                            </div>
                          </div>
                          <StatusBadge
                            status={conversation.status}
                            label={
                              ['open', 'pending', 'closed'].includes(conversation.status)
                                ? t(
                                    `filters.status.${conversation.status as InboxConversationStatus}`
                                  )
                                : conversation.status
                            }
                          />
                        </div>
                        <dl className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <dt className="text-mute">{t('columns.agent')}</dt>
                            <dd className="mt-0.5 font-medium text-ink">{agentLabel}</dd>
                          </div>
                          <div>
                            <dt className="text-mute">{t('columns.updated')}</dt>
                            <dd className="mt-0.5 tabular-nums text-body">
                              {formatUpdatedAt(updated)}
                            </dd>
                          </div>
                        </dl>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-dash-border bg-canvas px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm text-body">
            {t('showingCount', { count: total })}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor={rowsPerPageId} className="text-xs text-mute">
                {t('rowsPerPage')}
              </label>
              <select
                id={rowsPerPageId}
                value={PER_PAGE}
                disabled
                className={cn(selectClassName, 'h-8 w-[4.5rem] cursor-default opacity-70')}
                aria-label={t('rowsPerPage')}
              >
                <option value={PER_PAGE}>{PER_PAGE}</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={!canGoPrev || isPageLoading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden />
                {t('prevPage')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={!canGoNext || isPageLoading}
                onClick={() => setPage((prev) => prev + 1)}
              >
                {t('nextPage')}
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      </DashboardPanel>

      <InboxNewConversationSheet
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        onCreated={(conversationId) => {
          setNewConversationOpen(false)
          router.push(`/dashboard/inbox/${conversationId}`)
        }}
      />
      </div>
    </div>
  )
}
