'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type PlatformTemplateCatalogItem,
  type WhatsappMessageTemplate,
} from '@/lib/api'
import { unwrapPage } from '@/lib/api-unwrap'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CatalogTemplateFilters,
  type CatalogTemplateFilterValues,
} from '@/components/catalog/CatalogTemplateFilters'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'

const emptyFilters: CatalogTemplateFilterValues = {
  search: '',
  category: '',
  language: '',
  industry: '',
  topic: '',
}

export function TemplateCatalogBrowseDialog({
  open,
  organizationId,
  onOpenChange,
}: {
  open: boolean
  organizationId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('catalog.templates.org')
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<CatalogTemplateFilterValues>(emptyFilters)
  const [page, setPage] = useState(1)
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
    }),
    [filters, page]
  )

  const catalogQuery = useQuery({
    enabled: open && Boolean(organizationId),
    queryKey: queryKeys.templates.catalog(organizationId, queryParams),
    queryFn: async () => {
      const { data } = await api.templateCatalog.list(queryParams)
      return unwrapPage<PlatformTemplateCatalogItem>(data)
    },
  })

  const installedQuery = useQuery({
    enabled: open && Boolean(organizationId),
    queryKey: queryKeys.templates.list(organizationId, { perPage: 100 }),
    queryFn: async () => {
      const { data } = await api.whatsapp.listTemplates({ perPage: 100 })
      return unwrapTemplateList(data).items
    },
  })

  const installedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of installedQuery.data ?? []) {
      if (item.catalogTemplateId) ids.add(item.catalogTemplateId)
    }
    return ids
  }, [installedQuery.data])

  const installMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.templateCatalog.install(id)
      return data
    },
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.templates.all })
    },
    onError: (err) => setActionError((err as ApiError).message),
  })

  const items = catalogQuery.data?.items ?? []
  const lastPage = catalogQuery.data?.meta?.lastPage ?? 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>
        <CatalogTemplateFilters
          values={filters}
          onChange={(patch) => {
            setFilters((current) => ({ ...current, ...patch }))
            setPage(1)
          }}
          onClear={() => {
            setFilters(emptyFilters)
            setPage(1)
          }}
        />
        {actionError ? (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
        {catalogQuery.isLoading ? (
          <div className="flex items-center gap-2 text-mute">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const installed = installedIds.has(item.id)
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-dash-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="text-xs text-mute">
                      {item.category} · {item.language}
                      {item.libraryIndustry ? ` · ${item.libraryIndustry}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-body">{item.bodyText}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={installed || installMutation.isPending}
                    onClick={() => installMutation.mutate(item.id)}
                  >
                    {installed ? t('alreadyAdded') : t('useTemplate')}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex justify-end gap-2">
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
      </DialogContent>
    </Dialog>
  )
}

export type { WhatsappMessageTemplate }
