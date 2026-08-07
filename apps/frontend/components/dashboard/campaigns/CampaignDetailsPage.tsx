'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Copy, Loader2, Pencil } from 'lucide-react'
import { api, type ApiError } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { CampaignActionsMenu } from './CampaignCards'
import { CampaignComingSoonDialog, CampaignDeleteDialog } from './CampaignDialogs'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import { campaignQueryKeys } from './CampaignsListPage'
import {
  formatCampaignDate,
  isEditableCampaignStatus,
  ratePercent,
  unwrapCampaign,
} from './campaign-utils'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'

type CampaignDetailsPageProps = {
  campaignId: string
}

export function CampaignDetailsPage({ campaignId }: CampaignDetailsPageProps) {
  const t = useTranslations('dashboard.campaigns')
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    canViewCampaigns,
    canEditCampaigns,
    canDeleteCampaigns,
    isLoading: orgsLoading,
  } = useOrganizations()

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pauseOpen, setPauseOpen] = useState(false)

  const campaignQuery = useQuery({
    queryKey: campaignQueryKeys.detail(campaignId),
    enabled: Boolean(tenantOrganizationId) && canViewCampaigns && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.campaigns.get(campaignId)
      return unwrapCampaign(data)
    },
  })

  const templatesQuery = useQuery({
    queryKey: [...campaignQueryKeys.all, 'detail-templates', tenantOrganizationId],
    enabled: Boolean(tenantOrganizationId) && canViewCampaigns && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.whatsapp.listTemplates({ perPage: 100 })
      return unwrapTemplateList(data).items
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.campaigns.delete(campaignId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: campaignQueryKeys.all })
      router.push('/dashboard/campaigns')
    },
    onError: (err) => {
      setDeleteError((err as unknown as ApiError).message || t('errors.deleteFailed'))
    },
  })

  const campaign = campaignQuery.data
  const templateName = useMemo(() => {
    if (!campaign?.messageTemplateId) return null
    return (
      templatesQuery.data?.find((item) => item.id === campaign.messageTemplateId)?.name ??
      campaign.messageTemplateId
    )
  }, [campaign, templatesQuery.data])

  if (!orgsLoading && !canViewCampaigns) {
    return (
      <DashboardPanel as="section" className="mx-auto max-w-[1200px] px-4 py-6">
        <p role="alert" className="text-sm text-negative">
          {t('errors.permissionDenied')}
        </p>
      </DashboardPanel>
    )
  }

  if (campaignQuery.isLoading || orgsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  if (campaignQuery.isError || !campaign) {
    return (
      <DashboardPanel as="section" className="mx-auto max-w-[1200px] px-4 py-6">
        <p role="alert" className="text-sm text-negative">
          {(campaignQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
        </p>
        <Link href="/dashboard/campaigns" className="mt-4 inline-flex text-sm font-medium text-ink underline">
          {t('backToList')}
        </Link>
      </DashboardPanel>
    )
  }

  const delivery = ratePercent(campaign.deliveredCount, campaign.totalRecipients)
  const read = ratePercent(campaign.readCount, campaign.totalRecipients)
  const failed = ratePercent(campaign.failedCount, campaign.totalRecipients)
  const pending = Math.max(
    campaign.totalRecipients - campaign.deliveredCount - campaign.failedCount,
    0
  )
  const pendingRate = ratePercent(pending, campaign.totalRecipients)

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/campaigns"
            className="inline-flex items-center gap-2 text-sm font-medium text-body hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('backToList')}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
              {campaign.name}
            </h1>
            <span className="inline-flex rounded-full bg-primary-pale px-2.5 py-0.5 text-xs font-semibold text-positive-deep uppercase">
              {t('type.broadcast')}
            </span>
          </div>
          <p className="mt-2 text-sm text-body">
            {t('details.createdMeta', {
              date: formatCampaignDate(campaign.createdAt),
              template: templateName ?? t('noTemplate'),
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditCampaigns && isEditableCampaignStatus(campaign.status) ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => router.push(`/dashboard/campaigns/${campaign.id}/edit`)}
            >
              <Pencil className="size-4" aria-hidden />
              {t('actions.edit')}
            </Button>
          ) : null}
          {canEditCampaigns ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => router.push(`/dashboard/campaigns/create?from=${campaign.id}`)}
            >
              <Copy className="size-4" aria-hidden />
              {t('actions.duplicate')}
            </Button>
          ) : null}
          <CampaignActionsMenu
            campaign={campaign}
            canEdit={canEditCampaigns}
            canDelete={canDeleteCampaigns}
            onView={() => undefined}
            onEdit={() => router.push(`/dashboard/campaigns/${campaign.id}/edit`)}
            onDuplicate={() => router.push(`/dashboard/campaigns/create?from=${campaign.id}`)}
            onPause={() => setPauseOpen(true)}
            onDelete={() => {
              setDeleteError(null)
              setDeleteOpen(true)
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t('metrics.recipients')} value={campaign.totalRecipients.toLocaleString()} />
        <StatCard label={t('metrics.sent')} value={campaign.sentCount.toLocaleString()} />
        <StatCard
          label={t('metrics.delivered')}
          value={`${campaign.deliveredCount.toLocaleString()} (${delivery}%)`}
        />
        <StatCard
          label={t('metrics.read')}
          value={`${campaign.readCount.toLocaleString()} (${read}%)`}
        />
        <StatCard
          label={t('metrics.failed')}
          value={`${campaign.failedCount.toLocaleString()} (${failed}%)`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <DashboardPanel as="section" className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg text-ink">{t('details.timeline')}</h2>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <ol className="mt-5 space-y-4">
            <TimelineStep
              label={t('timeline.created')}
              detail={formatCampaignDate(campaign.createdAt)}
              active
            />
            <TimelineStep
              label={t('timeline.scheduled')}
              detail={formatCampaignDate(campaign.scheduledAt)}
              active={Boolean(campaign.scheduledAt) || ['scheduled', 'sending', 'sent', 'failed'].includes(campaign.status)}
            />
            <TimelineStep
              label={t('timeline.processing')}
              detail={campaign.status === 'sending' ? t('status.processing') : '—'}
              active={['sending', 'sent', 'failed'].includes(campaign.status)}
            />
            <TimelineStep
              label={t('timeline.completed')}
              detail={campaign.status === 'sent' ? formatCampaignDate(campaign.updatedAt) : '—'}
              active={campaign.status === 'sent'}
            />
          </ol>
        </DashboardPanel>

        <DashboardPanel as="section" className="p-5 sm:p-6">
          <h2 className="font-display text-lg text-ink">{t('details.performance')}</h2>
          <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <PerformanceRing percent={delivery} label={t('metrics.delivered')} />
            <ul className="w-full space-y-3 text-sm">
              <LegendRow
                color="bg-positive"
                label={t('metrics.delivered')}
                value={`${campaign.deliveredCount.toLocaleString()} (${delivery}%)`}
              />
              <LegendRow
                color="bg-dash-info"
                label={t('metrics.read')}
                value={`${campaign.readCount.toLocaleString()} (${read}%)`}
              />
              <LegendRow
                color="bg-negative"
                label={t('metrics.failed')}
                value={`${campaign.failedCount.toLocaleString()} (${failed}%)`}
              />
              <LegendRow
                color="bg-mute"
                label={t('metrics.pending')}
                value={`${pending.toLocaleString()} (${pendingRate}%)`}
              />
            </ul>
          </div>
        </DashboardPanel>
      </div>

      <CampaignDeleteDialog
        open={deleteOpen}
        campaign={campaign}
        pending={deleteMutation.isPending}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteOpen(false)
        }}
        onConfirm={() => deleteMutation.mutate()}
      />
      <CampaignComingSoonDialog open={pauseOpen} onOpenChange={setPauseOpen} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <DashboardPanel className="p-4">
      <p className="text-xs font-medium tracking-wide text-mute uppercase">{label}</p>
      <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
    </DashboardPanel>
  )
}

function TimelineStep({
  label,
  detail,
  active,
}: {
  label: string
  detail: string
  active: boolean
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-1 size-2.5 shrink-0 rounded-full ${active ? 'bg-primary' : 'bg-dash-border'}`}
        aria-hidden
      />
      <div>
        <p className={`text-sm font-medium ${active ? 'text-ink' : 'text-mute'}`}>{label}</p>
        <p className="text-xs text-mute">{detail}</p>
      </div>
    </li>
  )
}

function PerformanceRing({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  const angle = (clamped / 100) * 360
  return (
    <div
      className="relative flex size-36 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--positive) ${angle}deg, var(--dash-border) 0deg)`,
      }}
      aria-label={`${label} ${clamped}%`}
    >
      <div className="flex size-28 flex-col items-center justify-center rounded-full bg-canvas">
        <span className="text-2xl font-semibold text-ink">{clamped}%</span>
        <span className="text-xs text-mute">{label}</span>
      </div>
    </div>
  )
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: string
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-body">
        <span className={`size-2.5 rounded-full ${color}`} aria-hidden />
        {label}
      </span>
      <span className="font-medium text-ink">{value}</span>
    </li>
  )
}
