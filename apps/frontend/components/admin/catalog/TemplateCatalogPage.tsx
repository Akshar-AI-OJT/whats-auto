'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type CreatePlatformTemplateCatalogBody,
  type MetaTemplateLibraryItem,
  type PlatformTemplateCatalogItem,
} from '@/lib/api'
import { unwrapPage, unwrapSingle } from '@/lib/api-unwrap'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  CatalogTemplateFilters,
  type CatalogTemplateFilterValues,
} from '@/components/catalog/CatalogTemplateFilters'
import { TEMPLATE_CATEGORIES, TEMPLATE_LANGUAGES } from '@/components/dashboard/templates/template-utils'

const emptyFilters: CatalogTemplateFilterValues = {
  search: '',
  category: '',
  language: '',
  industry: '',
  topic: '',
  status: '',
  source: '',
}

export function TemplateCatalogPage() {
  const t = useTranslations('catalog.templates.admin')
  const tf = useTranslations('catalog.templates')
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'library' | 'saved'>('library')
  const [filters, setFilters] = useState<CatalogTemplateFilterValues>(emptyFilters)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Record<string, MetaTemplateLibraryItem>>({})
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState<CreatePlatformTemplateCatalogBody>({
    name: '',
    category: 'UTILITY',
    language: 'en_US',
    bodyText: '',
  })
  const [actionError, setActionError] = useState<string | null>(null)

  const queryParams = useMemo(
    () => ({
      page,
      perPage: 20,
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.language ? { language: filters.language } : {}),
      ...(filters.industry.trim() ? { industry: filters.industry.trim() } : {}),
      ...(filters.topic.trim() ? { topic: filters.topic.trim() } : {}),
      ...(tab === 'saved' && filters.status ? { status: filters.status } : {}),
      ...(tab === 'saved' && filters.source ? { source: filters.source } : {}),
    }),
    [filters, page, tab]
  )

  const savedQuery = useQuery({
    queryKey: queryKeys.admin.templateCatalog(queryParams),
    enabled: tab === 'saved',
    queryFn: async () => {
      const { data } = await api.superAdmin.templateCatalog.list(queryParams)
      return unwrapPage<PlatformTemplateCatalogItem>(data)
    },
  })

  const importedQuery = useQuery({
    queryKey: queryKeys.admin.templateCatalog({ perPage: 100, source: 'META_LIBRARY' }),
    queryFn: async () => {
      const { data } = await api.superAdmin.templateCatalog.list({
        perPage: 100,
        source: 'META_LIBRARY',
      })
      return unwrapPage<PlatformTemplateCatalogItem>(data)
    },
  })

  const libraryQuery = useQuery({
    enabled: tab === 'library',
    queryKey: queryKeys.admin.templateLibrary(queryParams),
    queryFn: async () => {
      const { data } = await api.superAdmin.templateLibrary.list(queryParams)
      return data
    },
    retry: false,
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

  const importMutation = useMutation({
    mutationFn: async (items: MetaTemplateLibraryItem[]) => {
      await api.superAdmin.templateCatalog.importItems(items)
    },
    onSuccess: async () => {
      setSelected({})
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'template-catalog'] })
    },
    onError: (err) => setActionError((err as ApiError).message),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.superAdmin.templateCatalog.create(manual)
      return unwrapSingle<PlatformTemplateCatalogItem>(data)
    },
    onSuccess: async () => {
      setManualOpen(false)
      setManual({ name: '', category: 'UTILITY', language: 'en_US', bodyText: '' })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'template-catalog'] })
    },
    onError: (err) => setActionError((err as ApiError).message),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.superAdmin.templateCatalog.archive(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'template-catalog'] })
    },
    onError: (err) => setActionError((err as ApiError).message),
  })

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.superAdmin.templateCatalog.publish(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'template-catalog'] })
    },
    onError: (err) => setActionError((err as ApiError).message),
  })

  const libraryMissing =
    tab === 'library' &&
    libraryQuery.isError &&
    (libraryQuery.error as ApiError)?.code === 'E_TEMPLATE_LIBRARY_TOKEN_MISSING'

  const libraryItems = libraryQuery.data?.data ?? []
  const savedItems = savedQuery.data?.items ?? []
  const lastPage = savedQuery.data?.meta?.lastPage ?? 1

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <DashboardSectionHeader title={t('title')} description={t('subtitle')} />

      <div className="flex gap-2">
        <Button
          type="button"
          variant={tab === 'library' ? 'default' : 'outline'}
          onClick={() => {
            setTab('library')
            setPage(1)
          }}
        >
          {t('tabs.library')}
        </Button>
        <Button
          type="button"
          variant={tab === 'saved' ? 'default' : 'outline'}
          onClick={() => {
            setTab('saved')
            setPage(1)
          }}
        >
          {t('tabs.saved')}
        </Button>
      </div>

      <DashboardPanel className="p-4 sm:p-5">
        <CatalogTemplateFilters
          values={filters}
          showAdminFilters={tab === 'saved'}
          onChange={(patch) => {
            setFilters((current) => ({ ...current, ...patch }))
            setPage(1)
          }}
          onClear={() => {
            setFilters(emptyFilters)
            setPage(1)
          }}
        />
      </DashboardPanel>

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {tab === 'library' ? (
        <DashboardPanel className="p-4 sm:p-5">
          {libraryMissing ? (
            <p className="text-sm text-body">{t('libraryTokenMissing')}</p>
          ) : libraryQuery.isLoading ? (
            <div className="flex items-center gap-2 text-mute">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {tf('loading')}
            </div>
          ) : libraryQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {(libraryQuery.error as ApiError).message}
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
                  {t('importCta', { count: Object.keys(selected).length })}
                </Button>
              </div>
              <ul className="space-y-2">
                {libraryItems.map((item) => {
                  const key = `${item.name ?? ''}:${item.language ?? 'en_US'}`
                  const already = importedKeys.has(key)
                  const checked = already || Boolean(selected[key])
                  return (
                    <li
                      key={key}
                      className="rounded-xl border border-dash-border p-3 text-sm"
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          disabled={already}
                          checked={checked}
                          onChange={(event) => {
                            setSelected((current) => {
                              const next = { ...current }
                              if (event.target.checked) next[key] = item
                              else delete next[key]
                              return next
                            })
                          }}
                        />
                        <span>
                          <span className="font-medium text-ink">{item.name}</span>
                          <span className="ml-2 text-mute">
                            {item.language} · {item.category ?? '—'} · {item.industry ?? '—'}
                          </span>
                          {already ? (
                            <span className="ml-2 text-xs text-positive-deep">{t('alreadyImported')}</span>
                          ) : null}
                          <p className="mt-1 text-body">{item.body || '—'}</p>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </DashboardPanel>
      ) : (
        <DashboardPanel className="p-4 sm:p-5">
          <div className="mb-4 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setManualOpen((open) => !open)}>
              {t('manualCreate')}
            </Button>
          </div>
          {manualOpen ? (
            <form
              className="mb-6 grid gap-3 rounded-xl border border-dash-border p-4"
              onSubmit={(event) => {
                event.preventDefault()
                createMutation.mutate()
              }}
            >
              <input
                className="h-10 rounded-xl border border-dash-border px-3 text-sm"
                value={manual.name}
                onChange={(event) =>
                  setManual((current) => ({ ...current, name: event.target.value }))
                }
                placeholder={t('manual.name')}
                required
              />
              <select
                className="h-10 rounded-xl border border-dash-border px-3 text-sm"
                value={manual.category}
                onChange={(event) =>
                  setManual((current) => ({ ...current, category: event.target.value }))
                }
              >
                {TEMPLATE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-xl border border-dash-border px-3 text-sm"
                value={manual.language}
                onChange={(event) =>
                  setManual((current) => ({ ...current, language: event.target.value }))
                }
              >
                {TEMPLATE_LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <textarea
                className="min-h-24 rounded-xl border border-dash-border px-3 py-2 text-sm"
                value={manual.bodyText}
                onChange={(event) =>
                  setManual((current) => ({ ...current, bodyText: event.target.value }))
                }
                placeholder={t('manual.body')}
                required
              />
              <Button type="submit" disabled={createMutation.isPending}>
                {t('manual.submit')}
              </Button>
            </form>
          ) : null}

          {savedQuery.isLoading ? (
            <div className="flex items-center gap-2 text-mute">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {tf('loading')}
            </div>
          ) : (
            <ul className="space-y-2">
              {savedItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-dash-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="text-xs text-mute">
                      {item.status} · {item.source} · {item.category} · {item.language}
                    </p>
                    <p className="mt-1 text-sm text-body">{item.bodyText}</p>
                  </div>
                  <div className="flex gap-2">
                    {item.status !== 'PUBLISHED' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => publishMutation.mutate(item.id)}
                      >
                        {t('publish')}
                      </Button>
                    ) : null}
                    {item.status !== 'ARCHIVED' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => archiveMutation.mutate(item.id)}
                      >
                        {t('archive')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              {tf('prev')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setPage((prev) => prev + 1)}
            >
              {tf('next')}
            </Button>
          </div>
        </DashboardPanel>
      )}
    </div>
  )
}
