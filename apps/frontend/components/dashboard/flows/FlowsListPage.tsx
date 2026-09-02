'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Search, Workflow } from 'lucide-react'
import {
  api,
  type ApiError,
  type ConversationFlow,
  type ConversationFlowStatus,
  type ConversationFlowTriggerType,
  type ConversationFlowValidationError,
} from '@/lib/api'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { queryKeys } from '@/lib/query-keys'
import { FlowsCreateDialog, FlowsDeleteDialog, FlowsPublishDialog } from './FlowsDialogs'
import {
  flowStatusBadgeClass,
  formatFlowDate,
  parseKeywordList,
  unwrapFlow,
  unwrapFlowList,
  unwrapFlowValidate,
  type FlowStatusFilter,
} from './flow-utils'

const STATUS_FILTERS: FlowStatusFilter[] = ['all', 'DRAFT', 'PUBLISHED', 'ARCHIVED']

export function FlowsListPage() {
  const t = useTranslations('dashboard.flows')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { tenantOrganizationId, permissions, isLoading: orgsLoading } = useOrganizations()

  const canView = hasPermission(permissions, PERMISSIONS.AUTOMATIONS_VIEW)
  const canCreate = hasPermission(permissions, PERMISSIONS.AUTOMATIONS_CREATE)
  const canDelete = hasPermission(permissions, PERMISSIONS.AUTOMATIONS_DELETE)
  const canPublish = hasPermission(permissions, PERMISSIONS.AUTOMATIONS_TOGGLE)

  const [statusFilter, setStatusFilter] = useState<FlowStatusFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ConversationFlow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [publishTarget, setPublishTarget] = useState<ConversationFlow | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishErrors, setPublishErrors] = useState<ConversationFlowValidationError[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const listParams = useMemo(
    () => ({
      page,
      perPage: 20,
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [page, statusFilter, search]
  )

  const listQuery = useQuery({
    queryKey: queryKeys.flows.list(tenantOrganizationId, listParams),
    enabled: Boolean(tenantOrganizationId) && canView && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.flows.list({
        page: listParams.page,
        perPage: listParams.perPage,
        ...(listParams.status ? { status: listParams.status as ConversationFlowStatus } : {}),
        ...(listParams.search ? { search: listParams.search } : {}),
      })
      return unwrapFlowList(data)
    },
  })

  const invalidateFlows = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.flows.all })
  }

  const createMutation = useMutation({
    mutationFn: async (values: {
      name: string
      description: string | null
      triggerType: ConversationFlowTriggerType
      keywords: string
    }) => {
      const { data } = await api.flows.create({
        name: values.name,
        description: values.description,
        triggerType: values.triggerType,
        ...(values.triggerType === 'KEYWORD'
          ? { triggerConfig: { keywords: parseKeywordList(values.keywords), matchType: 'exact' } }
          : {}),
      })
      return unwrapFlow(data)
    },
    onSuccess: async (flow) => {
      setCreateOpen(false)
      setCreateError(null)
      setPage(1)
      await invalidateFlows()
      if (flow?.id) router.push(`/dashboard/flows/${flow.id}`)
    },
    onError: (err) => {
      setCreateError((err as unknown as ApiError).message || t('errors.createFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.flows.delete(id),
    onMutate: (id) => {
      setActionId(id)
    },
    onSuccess: async () => {
      setDeleteTarget(null)
      setDeleteError(null)
      setActionError(null)
      await invalidateFlows()
    },
    onError: (err) => {
      setDeleteError((err as unknown as ApiError).message || t('errors.deleteFailed'))
    },
    onSettled: () => {
      setActionId(null)
    },
  })

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.flows.validate(id)
      const result = unwrapFlowValidate(data)
      if (!result.valid) {
        const error = new Error(t('errors.publishInvalid')) as Error & {
          validationErrors: ConversationFlowValidationError[]
        }
        error.validationErrors = result.errors
        throw error
      }
      await api.flows.publish(id)
    },
    onMutate: (id) => {
      setActionId(id)
      setPublishErrors([])
      setPublishError(null)
    },
    onSuccess: async () => {
      setPublishTarget(null)
      setPublishError(null)
      setPublishErrors([])
      setActionError(null)
      await invalidateFlows()
    },
    onError: (err) => {
      const withErrors = err as { validationErrors?: ConversationFlowValidationError[] }
      if (withErrors.validationErrors?.length) {
        setPublishErrors(withErrors.validationErrors)
        setPublishError(null)
        return
      }
      setPublishError((err as unknown as ApiError).message || t('errors.publishFailed'))
    },
    onSettled: () => {
      setActionId(null)
    },
  })

  const items = listQuery.data?.items ?? []
  const meta = listQuery.data?.meta
  const total = meta?.total ?? items.length
  const lastPage = meta?.lastPage ?? 1
  const perPage = meta?.perPage ?? 20
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  const busy = createMutation.isPending || deleteMutation.isPending || publishMutation.isPending

  function applySearch() {
    setSearch(searchInput)
    setPage(1)
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-mute uppercase">{t('eyebrow')}</p>
        <DashboardSectionHeader
          className="flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between"
          title={t('title')}
          description={t('subtitle')}
          action={
            canCreate ? (
              <Button
                type="button"
                className="w-full gap-2 sm:w-auto"
                onClick={() => {
                  setCreateError(null)
                  setCreateOpen(true)
                }}
                disabled={busy}
              >
                <Plus className="size-4" aria-hidden />
                {t('createCta')}
              </Button>
            ) : undefined
          }
        />
      </div>

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <DashboardPanel className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-dash-border p-4">
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch()
              }}
              placeholder={t('searchPlaceholder')}
              className="h-10 rounded-xl pl-9"
              aria-label={t('searchPlaceholder')}
            />
          </div>
          <p className="text-xs font-medium tracking-wide text-mute uppercase">
            {t('filters.label')}
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={statusFilter === value ? 'default' : 'outline'}
                onClick={() => {
                  setStatusFilter(value)
                  setPage(1)
                }}
              >
                {t(`filters.${value}`)}
              </Button>
            ))}
          </div>
        </div>

        {listQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-mute">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : listQuery.isError ? (
          <div className="space-y-3 p-8 text-center">
            <p role="alert" className="text-sm text-destructive">
              {(listQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void listQuery.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center sm:p-12">
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-dash-surface text-mute">
              <Workflow className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-base font-medium text-ink">{t('emptyTitle')}</p>
            <p className="mt-1 text-sm text-mute">{t('emptyDescription')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-dash-border">
            {items.map((flow) => (
              <FlowRow
                key={flow.id}
                flow={flow}
                locale={locale}
                acting={actionId === flow.id}
                canPublish={canPublish && flow.status !== 'ARCHIVED'}
                canDelete={canDelete && flow.status !== 'ARCHIVED'}
                onPublish={() => {
                  setPublishError(null)
                  setPublishErrors([])
                  setPublishTarget(flow)
                }}
                onDelete={() => {
                  setDeleteError(null)
                  setDeleteTarget(flow)
                }}
              />
            ))}
          </ul>
        )}

        {total > 0 ? (
          <div className="flex flex-col gap-3 border-t border-dash-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-mute">{t('pagination', { from, to, total })}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('prev')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('next')}
              </Button>
            </div>
          </div>
        ) : null}
      </DashboardPanel>

      <FlowsCreateDialog
        open={createOpen}
        pending={createMutation.isPending}
        error={createError}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setCreateError(null)
        }}
        onSubmit={(values) => createMutation.mutate(values)}
      />
      <FlowsDeleteDialog
        open={Boolean(deleteTarget)}
        flow={deleteTarget}
        pending={deleteMutation.isPending}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
      <FlowsPublishDialog
        open={Boolean(publishTarget)}
        flow={publishTarget}
        pending={publishMutation.isPending}
        error={publishError}
        validationErrors={publishErrors}
        onOpenChange={(open) => {
          if (!open) {
            setPublishTarget(null)
            setPublishError(null)
            setPublishErrors([])
          }
        }}
        onConfirm={() => {
          if (publishTarget) publishMutation.mutate(publishTarget.id)
        }}
      />
    </div>
  )
}

function FlowRow({
  flow,
  locale,
  acting,
  canPublish,
  canDelete,
  onPublish,
  onDelete,
}: {
  flow: ConversationFlow
  locale: string
  acting: boolean
  canPublish: boolean
  canDelete: boolean
  onPublish: () => void
  onDelete: () => void
}) {
  const t = useTranslations('dashboard.flows')
  const statusKey = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(flow.status) ? flow.status : 'DRAFT'
  const triggerKey = ['KEYWORD', 'INBOUND_ANY', 'CAMPAIGN_REPLY', 'SUBFLOW_ENTRY'].includes(
    flow.triggerType
  )
    ? flow.triggerType
    : 'KEYWORD'

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/flows/${flow.id}`}
            className="truncate text-sm font-medium text-ink hover:underline"
          >
            {flow.name}
          </Link>
          <span
            className={cn(
              'inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase',
              flowStatusBadgeClass(flow.status)
            )}
          >
            {t(`status.${statusKey}`)}
          </span>
        </div>
        <p className="mt-1 text-sm text-mute">
          {t(`triggerType.${triggerKey}`)}
          {flow.description ? ` · ${flow.description}` : ''}
        </p>
        <p className="mt-1 text-xs text-mute">{formatFlowDate(flow.createdAt, locale)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/dashboard/flows/${flow.id}`}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-ink bg-canvas px-4 text-sm font-semibold text-ink hover:bg-canvas-soft"
        >
          {t('actions.edit')}
        </Link>
        {canPublish ? (
          <Button type="button" size="sm" variant="outline" disabled={acting} onClick={onPublish}>
            {t('actions.publish')}
          </Button>
        ) : null}
        {canDelete ? (
          <Button type="button" size="sm" variant="outline" disabled={acting} onClick={onDelete}>
            {t('actions.archive')}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
