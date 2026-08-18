'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, Megaphone, Plus } from 'lucide-react'
import { api, type ApiError, type Campaign } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { CampaignCards } from './CampaignCards'
import { CampaignCancelDialog, CampaignDeleteDialog } from './CampaignDialogs'
import { CampaignFilters } from './CampaignFilters'
import { CampaignTable } from './CampaignTable'
import {
  type CampaignViewMode,
  filterCampaignsByDateRange,
  unwrapCampaign,
  unwrapCampaignList,
} from './campaign-utils'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'

export const campaignQueryKeys = {
  all: ['campaigns'] as const,
  list: (orgId: string | null | undefined, params: Record<string, string | number>) =>
    [...campaignQueryKeys.all, 'list', orgId ?? 'none', params] as const,
  detail: (id: string) => [...campaignQueryKeys.all, 'detail', id] as const,
}

export function CampaignsListPage() {
  const t = useTranslations('dashboard.campaigns')
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    canViewCampaigns,
    canCreateCampaigns,
    canEditCampaigns,
    canDeleteCampaigns,
    canPauseCampaigns,
    isLoading: orgsLoading,
  } = useOrganizations()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [startDateInput, setStartDateInput] = useState('')
  const [endDateInput, setEndDateInput] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [viewMode, setViewMode] = useState<CampaignViewMode>('cards')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Campaign | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [listActionError, setListActionError] = useState<string | null>(null)

  const listParams = useMemo(
    () => ({
      page,
      perPage: 12,
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [page, search]
  )

  const campaignsQuery = useQuery({
    queryKey: campaignQueryKeys.list(tenantOrganizationId, listParams),
    enabled: Boolean(tenantOrganizationId) && canViewCampaigns && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.campaigns.list(listParams)
      return unwrapCampaignList(data)
    },
  })

  const templatesQuery = useQuery({
    queryKey: [...campaignQueryKeys.all, 'template-names', tenantOrganizationId],
    enabled: Boolean(tenantOrganizationId) && canViewCampaigns && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.whatsapp.listTemplates({ perPage: 100 })
      return unwrapTemplateList(data).items
    },
  })

  const templateNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const template of templatesQuery.data ?? []) {
      map[template.id] = template.name
    }
    return map
  }, [templatesQuery.data])

  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      await api.campaigns.delete(campaignId)
    },
    onSuccess: async () => {
      setDeleteTarget(null)
      setDeleteError(null)
      await queryClient.invalidateQueries({ queryKey: campaignQueryKeys.all })
    },
    onError: (err) => {
      setDeleteError((err as unknown as ApiError).message || t('errors.deleteFailed'))
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data } = await api.campaigns.cancel(campaignId)
      return unwrapCampaign(data)
    },
    onSuccess: async () => {
      setCancelTarget(null)
      setCancelError(null)
      await queryClient.invalidateQueries({ queryKey: campaignQueryKeys.all })
    },
    onError: (err) => {
      setCancelError((err as unknown as ApiError).message || t('errors.cancelFailed'))
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data } = await api.campaigns.duplicate(campaignId)
      return unwrapCampaign(data)
    },
    onSuccess: async (campaign) => {
      setListActionError(null)
      await queryClient.invalidateQueries({ queryKey: campaignQueryKeys.all })
      if (campaign?.id) {
        router.push(`/dashboard/campaigns/${campaign.id}/edit`)
      }
    },
    onError: (err) => {
      setListActionError((err as unknown as ApiError).message || t('errors.duplicateFailed'))
    },
  })

  const items = useMemo(
    () => filterCampaignsByDateRange(campaignsQuery.data?.items ?? [], startDate, endDate),
    [campaignsQuery.data?.items, startDate, endDate]
  )

  const meta = campaignsQuery.data?.meta
  const total = meta?.total ?? items.length
  const lastPage = meta?.lastPage ?? 1

  function handleSearch() {
    setSearch(searchInput)
    setStartDate(startDateInput)
    setEndDate(endDateInput)
    setPage(1)
  }

  function handleClear() {
    setSearchInput('')
    setSearch('')
    setStartDateInput('')
    setEndDateInput('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  if (!orgsLoading && !canViewCampaigns) {
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
          {canCreateCampaigns ? (
            <Button
              type="button"
              className="gap-2"
              onClick={() => router.push('/dashboard/campaigns/create')}
            >
              <Plus className="size-4" aria-hidden />
              {t('createCta')}
            </Button>
          ) : null}
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <CampaignFilters
          search={searchInput}
          startDate={startDateInput}
          endDate={endDateInput}
          viewMode={viewMode}
          onSearchChange={setSearchInput}
          onStartDateChange={setStartDateInput}
          onEndDateChange={setEndDateInput}
          onSearch={handleSearch}
          onClear={handleClear}
          onViewModeChange={setViewMode}
        />

        {listActionError ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {listActionError}
          </div>
        ) : null}

        {campaignsQuery.isLoading || orgsLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : campaignsQuery.isError ? (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {(campaignsQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-primary-pale text-positive-deep">
              <Megaphone className="size-7" aria-hidden />
            </span>
            <div>
              <p className="font-display text-xl text-ink">{t('emptyTitle')}</p>
              <p className="mt-2 max-w-md text-sm text-body">{t('emptyDescription')}</p>
            </div>
            {canCreateCampaigns ? (
              <Button
                type="button"
                className="gap-2"
                onClick={() => router.push('/dashboard/campaigns/create')}
              >
                <Plus className="size-4" aria-hidden />
                {t('createCta')}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {viewMode === 'cards' ? (
              <CampaignCards
                campaigns={items}
                templateNames={templateNames}
                canEdit={canEditCampaigns}
                canCreate={canCreateCampaigns}
                canDelete={canDeleteCampaigns}
                canPause={canPauseCampaigns}
                onView={(campaign) => router.push(`/dashboard/campaigns/${campaign.id}`)}
                onEdit={(campaign) =>
                  router.push(`/dashboard/campaigns/${campaign.id}/edit`)
                }
                onDuplicate={(campaign) => duplicateMutation.mutate(campaign.id)}
                onPause={(campaign) => {
                  setCancelError(null)
                  setCancelTarget(campaign)
                }}
                onDelete={(campaign) => {
                  setDeleteError(null)
                  setDeleteTarget(campaign)
                }}
              />
            ) : (
              <CampaignTable
                campaigns={items}
                templateNames={templateNames}
                canEdit={canEditCampaigns}
                canCreate={canCreateCampaigns}
                canDelete={canDeleteCampaigns}
                canPause={canPauseCampaigns}
                onView={(campaign) => router.push(`/dashboard/campaigns/${campaign.id}`)}
                onEdit={(campaign) =>
                  router.push(`/dashboard/campaigns/${campaign.id}/edit`)
                }
                onDuplicate={(campaign) => duplicateMutation.mutate(campaign.id)}
                onPause={(campaign) => {
                  setCancelError(null)
                  setCancelTarget(campaign)
                }}
                onDelete={(campaign) => {
                  setDeleteError(null)
                  setDeleteTarget(campaign)
                }}
              />
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-mute">
                {t('pagination', {
                  from: items.length === 0 ? 0 : (page - 1) * 12 + 1,
                  to: Math.min(page * 12, total),
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

      <CampaignDeleteDialog
        open={Boolean(deleteTarget)}
        campaign={deleteTarget}
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

      <CampaignCancelDialog
        open={Boolean(cancelTarget)}
        campaign={cancelTarget}
        pending={cancelMutation.isPending}
        error={cancelError}
        onOpenChange={(open) => {
          if (!open && !cancelMutation.isPending) setCancelTarget(null)
        }}
        onConfirm={() => {
          if (!cancelTarget) return
          cancelMutation.mutate(cancelTarget.id)
        }}
      />
    </div>
  )
}
