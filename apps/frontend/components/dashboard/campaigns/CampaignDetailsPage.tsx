'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Copy, Eye, Loader2, PauseCircle, Pencil, Rocket } from 'lucide-react'
import { api, type ApiError, type CampaignPreview } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { CampaignActionsMenu } from './CampaignCards'
import {
  CampaignCancelDialog,
  CampaignDeleteDialog,
  CampaignPreviewDialog,
} from './CampaignDialogs'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import { queryKeys } from '@/lib/query-keys'
import {
  formatCampaignDate,
  isCancellableCampaignStatus,
  isEditableCampaignStatus,
  isLaunchableCampaignStatus,
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
    canCreateCampaigns,
    canEditCampaigns,
    canDeleteCampaigns,
    canLaunchCampaigns,
    canPauseCampaigns,
    isLoading: orgsLoading,
    activeOrganization,
  } = useOrganizations()

  const orgTimeZone = activeOrganization?.timezone
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<CampaignPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const campaignQuery = useQuery({
    queryKey: queryKeys.campaigns.detail(campaignId),
    enabled: Boolean(tenantOrganizationId) && canViewCampaigns && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.campaigns.get(campaignId)
      return unwrapCampaign(data)
    },
  })

  const templatesQuery = useQuery({
    queryKey: [...queryKeys.campaigns.all, 'detail-templates', tenantOrganizationId],
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      router.push('/dashboard/campaigns')
    },
    onError: (err) => {
      setDeleteError((err as unknown as ApiError).message || t('errors.deleteFailed'))
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.campaigns.cancel(campaignId)
      return unwrapCampaign(data)
    },
    onSuccess: async () => {
      setCancelOpen(false)
      setCancelError(null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
    },
    onError: (err) => {
      setCancelError((err as unknown as ApiError).message || t('errors.cancelFailed'))
    },
  })

  const launchMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.campaigns.send(campaignId)
      return unwrapCampaign(data)
    },
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError
      if (apiErr.code === 'E_CAMPAIGN_TEMPLATE_NOT_APPROVED') {
        setActionError(t('errors.templateNotApproved'))
        return
      }
      if (apiErr.code === 'E_CAMPAIGN_WA_CONFIG_NOT_CONNECTED') {
        setActionError(t('errors.whatsappNotConnected'))
        return
      }
      setActionError(apiErr.message || t('errors.launchFailed'))
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.campaigns.duplicate(campaignId)
      return unwrapCampaign(data)
    },
    onSuccess: async (campaign) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      if (campaign?.id) {
        router.push(`/dashboard/campaigns/${campaign.id}/edit`)
      }
    },
    onError: (err) => {
      setActionError((err as unknown as ApiError).message || t('errors.duplicateFailed'))
    },
  })

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.campaigns.preview(campaignId)
      if (data && typeof data === 'object' && 'bodyPreview' in data) {
        return data as CampaignPreview
      }
      const wrapped = data as { data?: CampaignPreview }
      return wrapped.data ?? null
    },
    onSuccess: (data) => {
      setPreview(data)
      setPreviewError(null)
    },
    onError: (err) => {
      setPreview(null)
      setPreviewError((err as unknown as ApiError).message || t('errors.previewFailed'))
    },
  })

  const campaign = campaignQuery.data
  const linkedTemplate = useMemo(() => {
    if (!campaign?.messageTemplateId || !templatesQuery.data) return null
    return templatesQuery.data.find((item) => item.id === campaign.messageTemplateId) ?? null
  }, [campaign, templatesQuery.data])

  const templateName = useMemo(() => {
    if (!campaign?.messageTemplateId) return null
    return linkedTemplate?.name ?? campaign.messageTemplateId
  }, [campaign, linkedTemplate])

  if (!orgsLoading && !canViewCampaigns) {
    return (
      <DashboardPanel as="section" className="w-full min-w-0 px-4 py-6">
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
      <DashboardPanel as="section" className="w-full min-w-0 px-4 py-6">
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
  const templateApproved =
    !templatesQuery.isFetched ||
    !campaign.messageTemplateId ||
    linkedTemplate?.status?.toLowerCase() === 'approved'
  const canLaunch =
    canLaunchCampaigns &&
    isLaunchableCampaignStatus(campaign.status) &&
    campaign.totalRecipients > 0 &&
    Boolean(campaign.messageTemplateId) &&
    templateApproved
  const canCancel = canPauseCampaigns && isCancellableCampaignStatus(campaign.status)

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
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
              date: formatCampaignDate(campaign.createdAt, orgTimeZone),
              template: templateName ?? t('noTemplate'),
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canViewCampaigns && campaign.messageTemplateId ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={previewMutation.isPending}
              onClick={() => {
                setPreviewOpen(true)
                setPreview(null)
                setPreviewError(null)
                previewMutation.mutate()
              }}
            >
              {previewMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
              {t('actions.preview')}
            </Button>
          ) : null}
          {canLaunch ? (
            <Button
              type="button"
              className="gap-2"
              disabled={launchMutation.isPending}
              onClick={() => launchMutation.mutate()}
            >
              {launchMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Rocket className="size-4" aria-hidden />
              )}
              {t('actions.launch')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setCancelError(null)
                setCancelOpen(true)
              }}
            >
              <PauseCircle className="size-4" aria-hidden />
              {t('actions.cancel')}
            </Button>
          ) : null}
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
          {canCreateCampaigns ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={duplicateMutation.isPending}
              onClick={() => duplicateMutation.mutate()}
            >
              {duplicateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {t('actions.duplicate')}
            </Button>
          ) : null}
          <CampaignActionsMenu
            campaign={campaign}
            canEdit={canEditCampaigns}
            canCreate={canCreateCampaigns}
            canDelete={canDeleteCampaigns}
            canPause={canPauseCampaigns}
            onView={() => undefined}
            onEdit={() => router.push(`/dashboard/campaigns/${campaign.id}/edit`)}
            onDuplicate={() => duplicateMutation.mutate()}
            onPause={() => {
              setCancelError(null)
              setCancelOpen(true)
            }}
            onDelete={() => {
              setDeleteError(null)
              setDeleteOpen(true)
            }}
          />
        </div>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative"
        >
          {actionError}
        </p>
      ) : null}

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
              detail={formatCampaignDate(campaign.createdAt, orgTimeZone)}
              active
            />
            <TimelineStep
              label={t('timeline.scheduled')}
              detail={formatCampaignDate(campaign.scheduledAt, orgTimeZone)}
              active={Boolean(campaign.scheduledAt) || ['scheduled', 'sending', 'sent', 'failed'].includes(campaign.status)}
            />
            <TimelineStep
              label={t('timeline.processing')}
              detail={campaign.status === 'sending' ? t('status.processing') : '—'}
              active={['sending', 'sent', 'failed'].includes(campaign.status)}
            />
            <TimelineStep
              label={t('timeline.completed')}
              detail={campaign.status === 'sent' ? formatCampaignDate(campaign.updatedAt, orgTimeZone) : '—'}
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
      <CampaignCancelDialog
        open={cancelOpen}
        campaign={campaign}
        pending={cancelMutation.isPending}
        error={cancelError}
        onOpenChange={(open) => {
          if (!open && !cancelMutation.isPending) setCancelOpen(false)
        }}
        onConfirm={() => cancelMutation.mutate()}
      />
      <CampaignPreviewDialog
        open={previewOpen}
        pending={previewMutation.isPending}
        error={previewError}
        preview={preview}
        onOpenChange={setPreviewOpen}
      />
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
