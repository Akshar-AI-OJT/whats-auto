'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { api, type ApiError, type ConversationFlow, type PlatformFlowCatalogItem } from '@/lib/api'
import { unwrapPage, unwrapSingle } from '@/lib/api-unwrap'
import { queryKeys } from '@/lib/query-keys'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getPlanFeatureCatalogLabel } from '@/components/admin/plans/plan-feature-catalog'
import { unwrapFlowList } from '@/components/dashboard/flows/flow-utils'

export function FlowCatalogBrowseDialog({
  open,
  organizationId,
  onOpenChange,
}: {
  open: boolean
  organizationId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('catalog.flows.org')
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [actionError, setActionError] = useState<string | null>(null)

  const params = useMemo(
    () => ({
      page,
      perPage: 20,
      ...(appliedSearch.trim() ? { search: appliedSearch.trim() } : {}),
    }),
    [appliedSearch, page]
  )

  const catalogQuery = useQuery({
    enabled: open && Boolean(organizationId),
    queryKey: queryKeys.flows.catalog(organizationId, params),
    queryFn: async () => {
      const { data } = await api.flowCatalog.list(params)
      return unwrapPage<PlatformFlowCatalogItem>(data)
    },
  })

  const installedQuery = useQuery({
    enabled: open && Boolean(organizationId),
    queryKey: queryKeys.flows.list(organizationId, { perPage: 100 }),
    queryFn: async () => {
      const { data } = await api.flows.list({ perPage: 100 })
      return unwrapFlowList(data).items
    },
  })

  const installedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of installedQuery.data ?? []) {
      if (item.catalogFlowId) ids.add(item.catalogFlowId)
    }
    return ids
  }, [installedQuery.data])

  const installMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.flowCatalog.install(id)
      return unwrapSingle<ConversationFlow>(data)
    },
    onSuccess: async (flow) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.flows.all })
      onOpenChange(false)
      if (flow?.id) router.push(`/dashboard/flows/${flow.id}`)
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
        <form
          className="flex gap-2"
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
                      {item.requiredFeatureKeys
                        .map((key) => getPlanFeatureCatalogLabel(key) ?? key)
                        .join(', ')}
                    </p>
                    {item.description ? (
                      <p className="mt-1 text-sm text-body">{item.description}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={installMutation.isPending}
                    onClick={() => {
                      if (installed) {
                        const existing = (installedQuery.data ?? []).find(
                          (flow) => flow.catalogFlowId === item.id
                        )
                        if (existing) {
                          onOpenChange(false)
                          router.push(`/dashboard/flows/${existing.id}`)
                        }
                        return
                      }
                      installMutation.mutate(item.id)
                    }}
                  >
                    {installed ? t('openInstalled') : t('useFlow')}
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
