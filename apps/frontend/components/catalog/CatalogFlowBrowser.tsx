'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, Plus } from 'lucide-react'
import {
  api,
  type ApiError,
  type ConversationFlow,
  type ConversationFlowTriggerType,
  type PlatformFlowCatalogItem,
  type PlatformTemplateCatalogItem,
  type WhatsappMessageTemplate,
} from '@/lib/api'
import { unwrapPage, unwrapSingle } from '@/lib/api-unwrap'
import { queryKeys } from '@/lib/query-keys'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { CatalogPager } from '@/components/catalog/CatalogPager'
import { CatalogFlowPreview } from '@/components/catalog/CatalogFlowPreview'
import { catalogTemplateAsWhatsapp } from '@/components/catalog/catalog-utils'
import { getPlanFeatureCatalogLabel } from '@/components/admin/plans/plan-feature-catalog'
import { unwrapFlow, unwrapFlowList } from '@/components/dashboard/flows/flow-utils'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'

export function CatalogFlowBrowser({
  variant,
  organizationId = null,
}: {
  variant: 'admin' | 'org'
  organizationId?: string | null
}) {
  const tAdmin = useTranslations('catalog.flows.admin')
  const tOrg = useTranslations('catalog.flows.org')
  const t = variant === 'admin' ? tAdmin : tOrg
  const tf = useTranslations('catalog.templates')
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createName, setCreateName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ConversationFlow | null>(null)

  const adminMode = variant === 'admin'
  const params = useMemo(
    () => ({
      page,
      perPage: 20,
      ...(appliedSearch.trim() ? { search: appliedSearch.trim() } : {}),
    }),
    [appliedSearch, page]
  )

  const listQuery = useQuery({
    queryKey: adminMode
      ? queryKeys.admin.flowCatalog(params)
      : queryKeys.flows.catalog(organizationId, params),
    enabled: adminMode || Boolean(organizationId),
    queryFn: async () => {
      const { data } = adminMode
        ? await api.superAdmin.flowCatalog.list(params)
        : await api.flowCatalog.list(params)
      return unwrapPage<PlatformFlowCatalogItem>(data)
    },
  })

  const installedQuery = useQuery({
    enabled: !adminMode && Boolean(organizationId),
    queryKey: queryKeys.flows.list(organizationId, { perPage: 100 }),
    queryFn: async () => {
      const { data } = await api.flows.list({ perPage: 100 })
      return unwrapFlowList(data).items
    },
  })

  const installedByCatalogId = useMemo(() => {
    const map = new Map<string, ConversationFlow>()
    for (const item of installedQuery.data ?? []) {
      if (item.catalogFlowId && item.status !== 'ARCHIVED') {
        map.set(item.catalogFlowId, item)
      }
    }
    return map
  }, [installedQuery.data])

  const items = listQuery.data?.items ?? []
  const lastPage = listQuery.data?.meta?.lastPage ?? 1
  const currentPage = listQuery.data?.meta?.currentPage ?? page
  const selectedItem = items.find((item) => item.id === previewId) ?? null
  const installedClone = previewId ? (installedByCatalogId.get(previewId) ?? null) : null
  const orgBrowse = !adminMode && Boolean(organizationId)
  const previewOpen = orgBrowse && Boolean(previewId) && Boolean(selectedItem)

  const installedReady = !orgBrowse || installedQuery.isFetched

  const catalogPreviewQuery = useQuery({
    enabled: previewOpen && installedReady && !installedClone,
    queryKey: queryKeys.flows.catalogDetail(organizationId, previewId),
    queryFn: async () => {
      const { data } = await api.flowCatalog.get(previewId!)
      return unwrapSingle<PlatformFlowCatalogItem>(data)
    },
  })

  const clonePreviewQuery = useQuery({
    enabled: previewOpen && installedReady && Boolean(installedClone?.id),
    queryKey: queryKeys.flows.detail(organizationId, installedClone?.id),
    queryFn: async () => {
      const { data } = await api.flows.get(installedClone!.id)
      return unwrapFlow(data)
    },
  })

  const catalogTemplatesQuery = useQuery({
    enabled: previewOpen && installedReady && !installedClone,
    queryKey: queryKeys.templates.catalog(organizationId, { perPage: 100 }),
    queryFn: async () => {
      const { data } = await api.templateCatalog.list({ perPage: 100 })
      return unwrapPage<PlatformTemplateCatalogItem>(data).items.map(catalogTemplateAsWhatsapp)
    },
  })

  const catalogFlowsLookupQuery = useQuery({
    enabled: previewOpen && installedReady && !installedClone,
    queryKey: queryKeys.flows.catalog(organizationId, { perPage: 100 }),
    queryFn: async () => {
      const { data } = await api.flowCatalog.list({ perPage: 100 })
      return unwrapPage<PlatformFlowCatalogItem>(data).items
    },
  })

  const orgTemplatesQuery = useQuery({
    enabled: previewOpen && installedReady && Boolean(installedClone),
    queryKey: queryKeys.templates.list(organizationId, { perPage: 100 }),
    queryFn: async () => {
      const { data } = await api.whatsapp.listTemplates({ perPage: 100 })
      return unwrapTemplateList(data).items
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.superAdmin.flowCatalog.create({ name: createName.trim() })
      return unwrapSingle<PlatformFlowCatalogItem>(data)
    },
    onSuccess: async (flow) => {
      setCreateName('')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flow-catalog'] })
      if (flow?.id) router.push(`/admin/flow-catalog/${flow.id}`)
    },
    onError: (err) => setActionError((err as unknown as ApiError).message),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.superAdmin.flowCatalog.archive(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flow-catalog'] })
    },
    onError: (err) => setActionError((err as unknown as ApiError).message),
  })

  const installMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.flowCatalog.install(id)
      return unwrapSingle<ConversationFlow>(data)
    },
    onSuccess: async (flow) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.flows.all })
      if (flow?.id) router.push(`/dashboard/flows/${flow.id}`)
    },
    onError: (err) => setActionError((err as unknown as ApiError).message),
  })

  const archiveInstalledMutation = useMutation({
    mutationFn: (id: string) => api.flows.delete(id),
    onSuccess: async () => {
      setActionError(null)
      setArchiveTarget(null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.flows.all })
    },
    onError: (err) => setActionError((err as unknown as ApiError).message),
  })

  const previewSource = installedClone ? clonePreviewQuery.data : catalogPreviewQuery.data
  const previewLoading =
    previewOpen &&
    (!installedReady ||
      (installedClone ? clonePreviewQuery.isLoading : catalogPreviewQuery.isLoading))
  const previewError = installedClone ? clonePreviewQuery.error : catalogPreviewQuery.error
  const triggerType = (previewSource?.triggerType ??
    selectedItem?.triggerType ??
    'KEYWORD') as ConversationFlowTriggerType
  const templatesById = useMemo(() => {
    const map = new Map<string, WhatsappMessageTemplate>()
    const rows = installedClone ? orgTemplatesQuery.data : catalogTemplatesQuery.data
    for (const item of rows ?? []) {
      map.set(item.id, item)
    }
    return map
  }, [catalogTemplatesQuery.data, installedClone, orgTemplatesQuery.data])
  const publishedFlowsById = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    if (installedClone) {
      for (const item of installedQuery.data ?? []) {
        map.set(item.id, { id: item.id, name: item.name })
      }
    } else {
      for (const item of catalogFlowsLookupQuery.data ?? []) {
        map.set(item.id, { id: item.id, name: item.name })
      }
    }
    return map
  }, [catalogFlowsLookupQuery.data, installedClone, installedQuery.data])

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <DashboardSectionHeader
        title={t('title')}
        description={t('subtitle')}
        action={
          adminMode ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (createName.trim()) createMutation.mutate()
              }}
            >
              <Input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={tAdmin('createPlaceholder')}
                className="h-10 w-56 rounded-xl"
              />
              <Button type="submit" disabled={createMutation.isPending || !createName.trim()}>
                <Plus className="size-4" aria-hidden />
                {tAdmin('createCta')}
              </Button>
            </form>
          ) : undefined
        }
      />

      <DashboardPanel className="p-4 sm:p-5">
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setAppliedSearch(search)
            setPage(1)
          }}
        >
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search')}
            className="h-10 rounded-xl"
          />
          <Button type="submit" variant="outline">
            {t('searchCta')}
          </Button>
        </form>

        {actionError && !archiveTarget && !previewOpen ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        {listQuery.isLoading ? (
          <div className="flex items-center gap-2 text-mute">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-mute">{t('empty')}</p>
        ) : adminMode ? (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-dash-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  type="button"
                  className="text-left"
                  onClick={() => router.push(`/admin/flow-catalog/${item.id}`)}
                >
                  <p className="font-medium text-ink">{item.name}</p>
                  <p className="text-xs text-mute">
                    {item.status} · {item.triggerType} ·{' '}
                    {item.requiredFeatureKeys
                      .map((key) => getPlanFeatureCatalogLabel(key) ?? key)
                      .join(', ')}
                  </p>
                </button>
                {item.status !== 'ARCHIVED' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => archiveMutation.mutate(item.id)}
                  >
                    {tAdmin('archive')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const installed = installedByCatalogId.get(item.id) ?? null
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-dash-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="text-xs text-mute">
                      {item.requiredFeatureKeys
                        .map((key) => getPlanFeatureCatalogLabel(key) ?? key)
                        .join(', ')}
                    </p>
                    {item.description ? (
                      <p className="mt-1 text-sm text-body">{item.description}</p>
                    ) : null}
                    {installed ? (
                      <p className="mt-1 text-xs text-positive-deep">{tOrg('alreadyInstalled')}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewId(item.id)}
                    >
                      {tOrg('previewCta')}
                    </Button>
                    {installed ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => router.push(`/dashboard/flows/${installed.id}`)}
                        >
                          {tOrg('openInstalled')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={archiveInstalledMutation.isPending}
                          onClick={() => {
                            setActionError(null)
                            setPreviewId(null)
                            setArchiveTarget(installed)
                          }}
                        >
                          {tOrg('archiveExisting')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={installMutation.isPending}
                        onClick={() => installMutation.mutate(item.id)}
                      >
                        {installMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : null}
                        {tOrg('useFlow')}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <CatalogPager
          prevLabel={t('prev')}
          nextLabel={t('next')}
          pageLabel={tf('pageOf', { page: currentPage, lastPage })}
          prevDisabled={page <= 1}
          nextDisabled={page >= lastPage}
          onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setPage((prev) => prev + 1)}
        />
      </DashboardPanel>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null)
        }}
      >
        <DialogContent
          size="fullscreen"
          className="gap-0 overflow-hidden p-0"
          showCloseButton
        >
          <DialogHeader className="border-b border-dash-border px-5 py-4 pr-14 text-left sm:px-6">
            <DialogTitle>{selectedItem?.name ?? tOrg('previewCta')}</DialogTitle>
            <DialogDescription>
              {installedClone ? tOrg('previewHintInstalled') : tOrg('previewHint')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4 sm:px-6">
            {installedClone ? (
              <p className="text-sm text-body">
                {tOrg('alreadyInstalledWarning', { name: installedClone.name })}
              </p>
            ) : null}
            {actionError && previewOpen ? (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            ) : null}
            {previewLoading ? (
              <div className="flex flex-1 items-center gap-2 text-mute">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {tOrg('previewLoading')}
              </div>
            ) : previewError ? (
              <p role="alert" className="text-sm text-destructive">
                {(previewError as unknown as ApiError).message}
              </p>
            ) : selectedItem ? (
              <CatalogFlowPreview
                className="min-h-0 flex-1"
                canvasKey={
                  installedClone
                    ? `org-clone-${installedClone.id}`
                    : `catalog-preview-${selectedItem.id}`
                }
                triggerType={triggerType}
                triggerKeywords={previewSource?.triggerConfig?.keywords ?? []}
                nodes={previewSource?.version?.nodes}
                edges={previewSource?.version?.edges}
                viewport={previewSource?.version?.viewport}
                templatesById={templatesById}
                publishedFlowsById={publishedFlowsById}
              />
            ) : null}
            <DialogFooter className="border-0 bg-transparent p-0 sm:flex-row sm:justify-end sm:gap-2">
              {installedClone ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPreviewId(null)
                      setActionError(null)
                      setArchiveTarget(installedClone)
                    }}
                  >
                    {tOrg('archiveExisting')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => router.push(`/dashboard/flows/${installedClone.id}`)}
                  >
                    {tOrg('openInstalled')}
                  </Button>
                </>
              ) : selectedItem ? (
                <Button
                  type="button"
                  disabled={installMutation.isPending}
                  onClick={() => installMutation.mutate(selectedItem.id)}
                >
                  {installMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {tOrg('useFlow')}
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (archiveInstalledMutation.isPending) return
          if (!open) setArchiveTarget(null)
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>{tOrg('archiveConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {tOrg('archiveConfirmBody', { name: archiveTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4 sm:px-6">
            <p className="text-sm text-body">{tOrg('archiveConfirmSessions')}</p>
            {actionError && archiveTarget ? (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            ) : null}
            <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={archiveInstalledMutation.isPending}
                onClick={() => setArchiveTarget(null)}
              >
                {tOrg('archiveCancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="gap-2"
                disabled={archiveInstalledMutation.isPending || !archiveTarget}
                onClick={() => {
                  if (archiveTarget) archiveInstalledMutation.mutate(archiveTarget.id)
                }}
              >
                {archiveInstalledMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {archiveInstalledMutation.isPending
                  ? tOrg('archiveConfirming')
                  : tOrg('archiveConfirm')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
