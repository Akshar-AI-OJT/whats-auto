'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type MetaTemplateLibraryItem,
  type PlatformTemplateCatalogItem,
} from '@/lib/api'
import { unwrapPage } from '@/lib/api-unwrap'
import { queryKeys } from '@/lib/query-keys'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  CatalogTemplateFilters,
  type CatalogTemplateFilterValues,
} from '@/components/catalog/CatalogTemplateFilters'
import { CatalogPager } from '@/components/catalog/CatalogPager'
import { ManualTemplateCreateDialog } from '@/components/catalog/ManualTemplateCreateDialog'
import {
  CatalogTemplatePreviewCard,
  CatalogTemplatePreviewGrid,
} from '@/components/catalog/CatalogTemplatePreviewCard'
import {
  catalogItemToPreviewProps,
  libraryItemKey,
  libraryItemMatchesFilters,
  libraryItemToPreviewProps,
} from '@/components/catalog/catalog-utils'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'

const emptyFilters: CatalogTemplateFilterValues = {
  search: '',
  category: '',
  language: '',
  industry: '',
  topic: '',
  status: '',
  source: '',
}

const LIBRARY_LIMIT = 20

export function CatalogTemplateBrowser({
  variant,
  organizationId = null,
}: {
  variant: 'admin' | 'org'
  organizationId?: string | null
}) {
  const tAdmin = useTranslations('catalog.templates.admin')
  const tOrg = useTranslations('catalog.templates.org')
  const tf = useTranslations('catalog.templates')
  const t = variant === 'admin' ? tAdmin : tOrg
  const queryClient = useQueryClient()
  const router = useRouter()
  const [tab, setTab] = useState<'library' | 'saved'>('library')
  const [filters, setFilters] = useState<CatalogTemplateFilterValues>(emptyFilters)
  const [savedPage, setSavedPage] = useState(1)
  const [libraryAfter, setLibraryAfter] = useState<string | undefined>(undefined)
  const [libraryCursorStack, setLibraryCursorStack] = useState<string[]>([])
  const [selected, setSelected] = useState<Record<string, MetaTemplateLibraryItem>>({})
  const [manualOpen, setManualOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const adminMode = variant === 'admin'
  const showLibrary = adminMode && tab === 'library'

  const savedQueryParams = useMemo(
    () => ({
      page: savedPage,
      perPage: LIBRARY_LIMIT,
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.language ? { language: filters.language } : {}),
      ...(filters.industry.trim() ? { industry: filters.industry.trim() } : {}),
      ...(filters.topic.trim() ? { topic: filters.topic.trim() } : {}),
      ...(adminMode && filters.status ? { status: filters.status } : {}),
      ...(adminMode && filters.source ? { source: filters.source } : {}),
    }),
    [adminMode, filters, savedPage]
  )

  const libraryQueryParams = useMemo(
    () => ({
      limit: LIBRARY_LIMIT,
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.language ? { language: filters.language } : {}),
      ...(filters.industry.trim() ? { industry: filters.industry.trim() } : {}),
      ...(filters.topic.trim() ? { topic: filters.topic.trim() } : {}),
      ...(libraryAfter ? { after: libraryAfter } : {}),
    }),
    [filters, libraryAfter]
  )

  function resetLibraryCursor() {
    setLibraryAfter(undefined)
    setLibraryCursorStack([])
  }

  function patchFilters(patch: Partial<CatalogTemplateFilterValues>) {
    setFilters((current) => ({ ...current, ...patch }))
    setSavedPage(1)
    resetLibraryCursor()
  }

  const savedQuery = useQuery({
    queryKey: adminMode
      ? queryKeys.admin.templateCatalog(savedQueryParams)
      : queryKeys.templates.catalog(organizationId, savedQueryParams),
    enabled: !showLibrary && (adminMode || Boolean(organizationId)),
    queryFn: async () => {
      const { data } = adminMode
        ? await api.superAdmin.templateCatalog.list(savedQueryParams)
        : await api.templateCatalog.list(savedQueryParams)
      return unwrapPage<PlatformTemplateCatalogItem>(data)
    },
  })

  const importedQuery = useQuery({
    queryKey: queryKeys.admin.templateCatalog({ perPage: 100, source: 'META_LIBRARY' }),
    enabled: showLibrary,
    queryFn: async () => {
      const { data } = await api.superAdmin.templateCatalog.list({
        perPage: 100,
        source: 'META_LIBRARY',
      })
      return unwrapPage<PlatformTemplateCatalogItem>(data)
    },
  })

  const libraryQuery = useQuery({
    enabled: showLibrary,
    queryKey: queryKeys.admin.templateLibrary(libraryQueryParams),
    queryFn: async () => {
      const { data } = await api.superAdmin.templateLibrary.list(libraryQueryParams)
      return data
    },
    retry: false,
  })

  const installedQuery = useQuery({
    enabled: variant === 'org' && Boolean(organizationId),
    queryKey: queryKeys.templates.list(organizationId, { perPage: 100 }),
    queryFn: async () => {
      const { data } = await api.whatsapp.listTemplates({ perPage: 100 })
      return unwrapTemplateList(data).items
    },
  })

  const importedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const item of importedQuery.data?.items ?? []) {
      if (item.libraryTemplateName) {
        keys.add(`${item.libraryTemplateName}:${item.language}`)
      }
    }
    return keys
  }, [importedQuery.data])

  const installedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of installedQuery.data ?? []) {
      if (item.catalogTemplateId) ids.add(item.catalogTemplateId)
    }
    return ids
  }, [installedQuery.data])

  const importMutation = useMutation({
    mutationFn: async (items: MetaTemplateLibraryItem[]) => {
      await api.superAdmin.templateCatalog.importItems(items)
    },
    onSuccess: async () => {
      setSelected({})
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'template-catalog'] })
    },
    onError: (err) => setActionError((err as unknown as ApiError).message),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.superAdmin.templateCatalog.archive(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'template-catalog'] })
    },
    onError: (err) => setActionError((err as unknown as ApiError).message),
  })

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.superAdmin.templateCatalog.publish(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'template-catalog'] })
    },
    onError: (err) => setActionError((err as unknown as ApiError).message),
  })

  function openCatalogConfigure(id: string) {
    router.push(`/dashboard/templates/create?catalog=${id}`)
  }

  const libraryMissing =
    showLibrary &&
    libraryQuery.isError &&
    (libraryQuery.error as unknown as ApiError)?.code === 'E_TEMPLATE_LIBRARY_TOKEN_MISSING'

  const libraryItems = useMemo(() => {
    const raw = libraryQuery.data?.data ?? []
    return raw.filter((item) =>
      libraryItemMatchesFilters(item, {
        category: filters.category || undefined,
        language: filters.language || undefined,
      })
    )
  }, [filters.category, filters.language, libraryQuery.data])

  const libraryNextCursor = libraryQuery.data?.paging?.cursors?.after
  const savedItems = savedQuery.data?.items ?? []
  const savedLastPage = savedQuery.data?.meta?.lastPage ?? 1
  const savedCurrentPage = savedQuery.data?.meta?.currentPage ?? savedPage

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <DashboardSectionHeader title={t('title')} description={t('subtitle')} />

      {adminMode ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={tab === 'library' ? 'default' : 'outline'}
            onClick={() => {
              setTab('library')
              resetLibraryCursor()
            }}
          >
            {tAdmin('tabs.library')}
          </Button>
          <Button
            type="button"
            variant={tab === 'saved' ? 'default' : 'outline'}
            onClick={() => {
              setTab('saved')
              setSavedPage(1)
            }}
          >
            {tAdmin('tabs.saved')}
          </Button>
        </div>
      ) : null}

      <DashboardPanel className="p-4 sm:p-5">
        <CatalogTemplateFilters
          values={filters}
          showAdminFilters={adminMode && tab === 'saved'}
          onChange={patchFilters}
          onClear={() => {
            setFilters(emptyFilters)
            setSavedPage(1)
            resetLibraryCursor()
          }}
        />
      </DashboardPanel>

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {showLibrary ? (
        <DashboardPanel className="p-4 sm:p-5">
          {libraryMissing ? (
            <p className="text-sm text-body">{tAdmin('libraryTokenMissing')}</p>
          ) : libraryQuery.isLoading ? (
            <div className="flex items-center gap-2 text-mute">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {tf('loading')}
            </div>
          ) : libraryQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {(libraryQuery.error as unknown as ApiError).message}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={Object.keys(selected).length === 0 || importMutation.isPending}
                  onClick={() => importMutation.mutate(Object.values(selected))}
                >
                  {importMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {tAdmin('importCta', { count: Object.keys(selected).length })}
                </Button>
              </div>
              {libraryItems.length === 0 ? (
                <p className="text-sm text-mute">{tf('empty')}</p>
              ) : (
                <CatalogTemplatePreviewGrid>
                  {libraryItems.map((item) => {
                    const key = libraryItemKey(item)
                    const already = importedKeys.has(key)
                    const checked = already || Boolean(selected[key])
                    const preview = libraryItemToPreviewProps(item)
                    return (
                      <CatalogTemplatePreviewCard
                        key={key}
                        {...preview}
                        name={preview.name || key}
                        language={item.language}
                        category={item.category}
                        extraMeta={item.industry ?? item.topic ?? null}
                        selectable={!already}
                        selected={checked}
                        onSelectChange={
                          already
                            ? undefined
                            : (next) => {
                                setSelected((current) => {
                                  const copy = { ...current }
                                  if (next) copy[key] = item
                                  else delete copy[key]
                                  return copy
                                })
                              }
                        }
                        leading={
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={already}
                            checked={checked}
                            aria-label={item.name}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              setSelected((current) => {
                                const next = { ...current }
                                if (event.target.checked) next[key] = item
                                else delete next[key]
                                return next
                              })
                            }}
                          />
                        }
                        actions={
                          already ? (
                            <span className="text-xs text-positive-deep">
                              {tAdmin('alreadyImported')}
                            </span>
                          ) : null
                        }
                      />
                    )
                  })}
                </CatalogTemplatePreviewGrid>
              )}
              <CatalogPager
                prevLabel={tf('prev')}
                nextLabel={tf('next')}
                prevDisabled={libraryCursorStack.length === 0}
                nextDisabled={!libraryNextCursor}
                onPrev={() => {
                  setLibraryCursorStack((stack) => {
                    const next = [...stack]
                    const prev = next.pop()
                    setLibraryAfter(prev === '' ? undefined : prev)
                    return next
                  })
                }}
                onNext={() => {
                  if (!libraryNextCursor) return
                  setLibraryCursorStack((stack) => [...stack, libraryAfter ?? ''])
                  setLibraryAfter(libraryNextCursor)
                }}
              />
            </div>
          )}
        </DashboardPanel>
      ) : (
        <DashboardPanel className="p-4 sm:p-5">
          {adminMode ? (
            <div className="mb-4 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setManualOpen(true)}>
                {tAdmin('manualCreate')}
              </Button>
            </div>
          ) : null}

          {savedQuery.isLoading ? (
            <div className="flex items-center gap-2 text-mute">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {tf('loading')}
            </div>
          ) : savedItems.length === 0 ? (
            <p className="text-sm text-mute">{tf('empty')}</p>
          ) : (
            <CatalogTemplatePreviewGrid>
              {savedItems.map((item) => {
                const preview = catalogItemToPreviewProps(item)
                const installed = installedIds.has(item.id)
                return (
                  <CatalogTemplatePreviewCard
                    key={item.id}
                    {...preview}
                    language={item.language}
                    category={item.category}
                    extraMeta={
                      adminMode
                        ? `${item.status} · ${item.source}`
                        : item.libraryIndustry
                    }
                    actions={
                      adminMode ? (
                        <>
                          {item.status !== 'PUBLISHED' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => publishMutation.mutate(item.id)}
                            >
                              {tAdmin('publish')}
                            </Button>
                          ) : null}
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
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={installed}
                          onClick={() => openCatalogConfigure(item.id)}
                        >
                          {installed ? tOrg('alreadyAdded') : tOrg('useTemplate')}
                        </Button>
                      )
                    }
                  />
                )
              })}
            </CatalogTemplatePreviewGrid>
          )}
          <CatalogPager
            prevLabel={tf('prev')}
            nextLabel={tf('next')}
            pageLabel={tf('pageOf', { page: savedCurrentPage, lastPage: savedLastPage })}
            prevDisabled={savedPage <= 1}
            nextDisabled={savedPage >= savedLastPage}
            onPrev={() => setSavedPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setSavedPage((prev) => prev + 1)}
          />
        </DashboardPanel>
      )}

      {adminMode ? (
        <ManualTemplateCreateDialog open={manualOpen} onOpenChange={setManualOpen} />
      ) : null}
    </div>
  )
}
