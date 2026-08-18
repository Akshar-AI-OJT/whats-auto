'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { FileText, LayoutGrid, Loader2, Plus, RefreshCw } from 'lucide-react'
import {
  api,
  type ApiError,
  type WhatsappConfigSummary,
  type WhatsappMessageTemplate,
} from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { unwrapList } from '@/components/dashboard/inbox/inbox-utils'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { TemplateCards } from './TemplateCards'
import { TemplateFilters } from './TemplateFilters'
import { TemplateTable } from './TemplateTable'
import {
  TemplateDeleteDialog,
  TemplateSyncDialog,
  useSyncProgress,
} from './TemplateDialogs'
import {
  type TemplateStatusTab,
  type TemplateViewMode,
  unwrapTemplateList,
} from './template-utils'

export const templateQueryKeys = {
  all: ['whatsapp-templates'] as const,
  list: (orgId: string | null | undefined, params: Record<string, string | number>) =>
    [...templateQueryKeys.all, 'list', orgId ?? 'none', params] as const,
  detail: (id: string) => [...templateQueryKeys.all, 'detail', id] as const,
  whatsappConnected: (orgId: string | null | undefined) =>
    [...templateQueryKeys.all, 'whatsapp-connected', orgId ?? 'none'] as const,
}

export function TemplatesListPage() {
  const t = useTranslations('dashboard.templates')
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    canViewTemplates,
    canCreateTemplates,
    canSyncTemplates,
    canDeleteTemplates,
    isLoading: orgsLoading,
  } = useOrganizations()

  const canManageTemplates = canCreateTemplates || canDeleteTemplates

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [language, setLanguage] = useState('')
  const [statusTab, setStatusTab] = useState<TemplateStatusTab>('all')
  const [viewMode, setViewMode] = useState<TemplateViewMode>('cards')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<WhatsappMessageTemplate | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncedCount, setSyncedCount] = useState<number | null>(null)
  const [syncPending, setSyncPending] = useState(false)
  const [browseComingSoonOpen, setBrowseComingSoonOpen] = useState(false)
  const { progress, complete: completeProgress } = useSyncProgress(syncPending)

  const listParams = useMemo(
    () => ({
      page,
      perPage: 20,
      ...(statusTab !== 'all' ? { status: statusTab } : {}),
      ...(category ? { category } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [page, statusTab, category, search]
  )

  const hasActiveFilters = Boolean(
    search.trim() || category || language || statusTab !== 'all'
  )

  const templatesQuery = useQuery({
    queryKey: templateQueryKeys.list(tenantOrganizationId, listParams),
    enabled: Boolean(tenantOrganizationId) && canViewTemplates && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.whatsapp.listTemplates(listParams)
      return unwrapTemplateList(data)
    },
  })

  const whatsappQuery = useQuery({
    queryKey: templateQueryKeys.whatsappConnected(tenantOrganizationId),
    enabled: Boolean(tenantOrganizationId) && canViewTemplates && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.whatsapp.listConfigs()
      return unwrapList<WhatsappConfigSummary>(data)
    },
  })

  const whatsappConnected = useMemo(
    () => (whatsappQuery.data ?? []).some((cfg) => cfg.status === 'connected'),
    [whatsappQuery.data]
  )

  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      await api.whatsapp.deleteTemplate(templateId)
    },
    onSuccess: async () => {
      setDeleteTarget(null)
      setDeleteError(null)
      await queryClient.invalidateQueries({ queryKey: templateQueryKeys.all })
    },
    onError: (err) => {
      setDeleteError((err as unknown as ApiError).message || t('errors.deleteFailed'))
    },
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.whatsapp.syncTemplates()
      const result =
        data && typeof data === 'object' && 'syncedCount' in data
          ? data
          : ((data as { data?: { syncedCount?: number } } | undefined)?.data ?? null)
      return Number(result?.syncedCount ?? 0)
    },
    onMutate: () => {
      setSyncOpen(true)
      setSyncPending(true)
      setSyncError(null)
      setSyncedCount(null)
    },
    onSuccess: async (count) => {
      setSyncedCount(count)
      completeProgress()
      setSyncPending(false)
      await queryClient.invalidateQueries({ queryKey: templateQueryKeys.all })
    },
    onError: (err) => {
      setSyncError((err as unknown as ApiError).message || t('errors.syncFailed'))
      completeProgress()
      setSyncPending(false)
    },
  })

  const items = useMemo(() => {
    const rows = templatesQuery.data?.items ?? []
    if (!language) return rows
    return rows.filter((row) => (row.language ?? '') === language)
  }, [templatesQuery.data?.items, language])

  const meta = templatesQuery.data?.meta
  const total = meta?.total ?? items.length
  const lastPage = meta?.lastPage ?? 1

  function clearFilters() {
    setSearch('')
    setCategory('')
    setLanguage('')
    setStatusTab('all')
    setPage(1)
  }

  function openDuplicate(template: WhatsappMessageTemplate) {
    router.push(`/dashboard/templates/create?from=${template.id}`)
  }

  if (!orgsLoading && !canViewTemplates) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <div
            role="alert"
            className="mt-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"
          >
            {t('errors.permissionDenied')}
          </div>
        </DashboardPanel>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base">
              {t('subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto">
            {canSyncTemplates ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-2"
                disabled={syncMutation.isPending || !whatsappConnected}
                title={!whatsappConnected ? t('whatsappRequired.syncHint') : undefined}
                onClick={() => {
                  if (!whatsappConnected) return
                  syncMutation.mutate()
                }}
              >
                <RefreshCw className="size-4" aria-hidden />
                {t('syncCta')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-2"
              onClick={() => setBrowseComingSoonOpen(true)}
            >
              <LayoutGrid className="size-4" aria-hidden />
              {t('browseCta')}
            </Button>
            {canCreateTemplates ? (
              <Button
                type="button"
                className="shrink-0 gap-2"
                onClick={() => router.push('/dashboard/templates/create')}
              >
                <Plus className="size-4" aria-hidden />
                {t('createCta')}
              </Button>
            ) : null}
          </div>
        </div>

        {!whatsappQuery.isLoading && !whatsappConnected ? (
          <div
            role="status"
            className="mt-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"
          >
            <p className="font-medium">{t('whatsappRequired.title')}</p>
            <p className="mt-1 text-body">{t('whatsappRequired.body')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => router.push('/dashboard/whatsapp')}
            >
              {t('whatsappRequired.cta')}
            </Button>
          </div>
        ) : null}
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader title={t('listTitle')} description={t('listDescription')} />

        <div className="mt-5">
          <TemplateFilters
            search={search}
            category={category}
            statusTab={statusTab}
            language={language}
            viewMode={viewMode}
            hasActiveFilters={hasActiveFilters}
            onSearchChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            onCategoryChange={(value) => {
              setCategory(value)
              setPage(1)
            }}
            onStatusTabChange={(value) => {
              setStatusTab(value)
              setPage(1)
            }}
            onLanguageChange={(value) => {
              setLanguage(value)
              setPage(1)
            }}
            onViewModeChange={setViewMode}
            onClearFilters={clearFilters}
          />
        </div>

        {templatesQuery.isLoading || orgsLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : templatesQuery.isError ? (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {(templatesQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <FileText className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{t('emptyTitle')}</p>
            <p className="max-w-sm text-sm text-body">{t('emptyDescription')}</p>
            {canCreateTemplates ? (
              <Button
                type="button"
                className="mt-2 gap-2"
                onClick={() => router.push('/dashboard/templates/create')}
              >
                <Plus className="size-4" aria-hidden />
                {t('createCta')}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {viewMode === 'cards' ? (
              <TemplateCards
                templates={items}
                canManage={canManageTemplates}
                onView={(template) => router.push(`/dashboard/templates/${template.id}`)}
                onDuplicate={openDuplicate}
                onDelete={(template) => {
                  setDeleteError(null)
                  setDeleteTarget(template)
                }}
              />
            ) : (
              <TemplateTable
                templates={items}
                canManage={canManageTemplates}
                onView={(template) => router.push(`/dashboard/templates/${template.id}`)}
                onDuplicate={openDuplicate}
                onDelete={(template) => {
                  setDeleteError(null)
                  setDeleteTarget(template)
                }}
              />
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-mute">
                {t('pagination', {
                  from: (page - 1) * 20 + 1,
                  to: Math.min(page * 20, total),
                  total,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  {t('prev')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= lastPage}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DashboardPanel>

      <TemplateDeleteDialog
        open={Boolean(deleteTarget)}
        template={deleteTarget}
        pending={deleteMutation.isPending}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null)
        }}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteMutation.mutate(deleteTarget.id)
        }}
      />

      <TemplateSyncDialog
        open={syncOpen}
        pending={syncMutation.isPending}
        progress={
          syncMutation.isPending ? progress : syncedCount != null || syncError ? 100 : progress
        }
        syncedCount={syncedCount}
        error={syncError}
        onOpenChange={setSyncOpen}
        onRetry={() => syncMutation.mutate()}
      />

      <Dialog open={browseComingSoonOpen} onOpenChange={setBrowseComingSoonOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>{t('browseComingSoon.title')}</DialogTitle>
            <DialogDescription>{t('browseComingSoon.body')}</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4 sm:px-6">
            <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
              <Button type="button" onClick={() => setBrowseComingSoonOpen(false)}>
                {t('browseComingSoon.dismiss')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
