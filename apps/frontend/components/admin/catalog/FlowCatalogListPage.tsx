'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, Plus } from 'lucide-react'
import { api, type ApiError, type PlatformFlowCatalogItem } from '@/lib/api'
import { unwrapPage, unwrapSingle } from '@/lib/api-unwrap'
import { queryKeys } from '@/lib/query-keys'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { getPlanFeatureCatalogLabel } from '@/components/admin/plans/plan-feature-catalog'

export function FlowCatalogListPage() {
  const t = useTranslations('catalog.flows.admin')
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createName, setCreateName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const params = useMemo(
    () => ({
      page,
      perPage: 20,
      ...(appliedSearch.trim() ? { search: appliedSearch.trim() } : {}),
    }),
    [appliedSearch, page]
  )

  const listQuery = useQuery({
    queryKey: queryKeys.admin.flowCatalog(params),
    queryFn: async () => {
      const { data } = await api.superAdmin.flowCatalog.list(params)
      return unwrapPage<PlatformFlowCatalogItem>(data)
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
    onError: (err) => setActionError((err as ApiError).message),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.superAdmin.flowCatalog.archive(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flow-catalog'] })
    },
    onError: (err) => setActionError((err as ApiError).message),
  })

  const items = listQuery.data?.items ?? []
  const lastPage = listQuery.data?.meta?.lastPage ?? 1

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <DashboardSectionHeader
        title={t('title')}
        description={t('subtitle')}
        action={
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
              placeholder={t('createPlaceholder')}
              className="h-10 w-56 rounded-xl"
            />
            <Button type="submit" disabled={createMutation.isPending || !createName.trim()}>
              <Plus className="size-4" aria-hidden />
              {t('createCta')}
            </Button>
          </form>
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

        {actionError ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        {listQuery.isLoading ? (
          <div className="flex items-center gap-2 text-mute">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : (
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
                    {t('archive')}
                  </Button>
                ) : null}
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
      </DashboardPanel>
    </div>
  )
}
