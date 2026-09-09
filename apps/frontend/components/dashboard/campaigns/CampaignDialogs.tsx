'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { Campaign, CampaignPreview } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  isoInstantToDateTimeLocal,
  isCampaignScheduleInFuture,
} from '@/lib/org-datetime'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type CampaignDeleteDialogProps = {
  open: boolean
  campaign: Campaign | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function CampaignDeleteDialog({
  open,
  campaign,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: CampaignDeleteDialogProps) {
  const t = useTranslations('dashboard.campaigns.delete')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body', { name: campaign?.name ?? '' })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          {error ? (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !campaign}
              className="gap-2"
              onClick={onConfirm}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? t('deleting') : t('confirm')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type CampaignCancelDialogProps = {
  open: boolean
  campaign: Campaign | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function CampaignCancelDialog({
  open,
  campaign,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: CampaignCancelDialogProps) {
  const t = useTranslations('dashboard.campaigns.cancel')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body', { name: campaign?.name ?? '' })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          {error ? (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('dismiss')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !campaign}
              className="gap-2"
              onClick={onConfirm}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? t('cancelling') : t('confirm')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type CampaignPreviewDialogProps = {
  open: boolean
  pending: boolean
  error: string | null
  preview: CampaignPreview | null
  onOpenChange: (open: boolean) => void
}

export function CampaignPreviewDialog({
  open,
  pending,
  error,
  preview,
  onOpenChange,
}: CampaignPreviewDialogProps) {
  const t = useTranslations('dashboard.campaigns.preview')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {preview?.templateName
              ? t('subtitle', { template: preview.templateName })
              : t('subtitleFallback')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          {pending ? (
            <p className="inline-flex items-center gap-2 text-sm text-body">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('loading')}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
          {!pending && !error && preview ? (
            <div className="rounded-2xl border border-dash-border bg-dash-surface/40 p-4 text-sm">
              {preview.templateName ? (
                <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                  {preview.templateName}
                </p>
              ) : null}
              {preview.headerPreview ? (
                <p className="mt-2 font-semibold text-ink">{preview.headerPreview}</p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-ink">{preview.bodyPreview}</p>
              {preview.footerPreview ? (
                <p className="mt-2 text-xs text-mute">{preview.footerPreview}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('dismiss')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type CampaignRescheduleDialogProps = {
  open: boolean
  campaign: Campaign | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (scheduledAtLocal: string) => void
}

export function CampaignRescheduleDialog({
  open,
  campaign,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: CampaignRescheduleDialogProps) {
  const t = useTranslations('dashboard.campaigns.reschedule')
  const tForm = useTranslations('dashboard.campaigns.form')
  const campaignKey = open && campaign ? `${campaign.id}:${campaign.scheduledAt ?? ''}` : ''
  const [trackedKey, setTrackedKey] = useState(campaignKey)
  const [scheduledAt, setScheduledAt] = useState(() =>
    isoInstantToDateTimeLocal(campaign?.scheduledAt)
  )
  const [localError, setLocalError] = useState<string | null>(null)

  if (campaignKey !== trackedKey) {
    setTrackedKey(campaignKey)
    if (campaignKey) {
      setScheduledAt(isoInstantToDateTimeLocal(campaign?.scheduledAt))
      setLocalError(null)
    }
  }

  function handleConfirm() {
    if (!scheduledAt) {
      setLocalError(tForm('errors.scheduledAtRequired'))
      return
    }
    if (!isCampaignScheduleInFuture(scheduledAt)) {
      setLocalError(tForm('errors.scheduledAtFuture'))
      return
    }
    setLocalError(null)
    onConfirm(scheduledAt)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body', { name: campaign?.name ?? '' })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          <div className="space-y-1.5">
            <label htmlFor="campaign-reschedule-at" className="text-sm font-medium text-ink">
              {t('scheduledAt')}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="campaign-reschedule-at"
                type="datetime-local"
                value={scheduledAt}
                disabled={pending}
                onChange={(e) => {
                  setScheduledAt(e.target.value)
                  setLocalError(null)
                }}
              />
              <span className="shrink-0 text-sm font-medium text-mute">{t('utcLabel')}</span>
            </div>
            <p className="text-xs text-mute">{t('hint')}</p>
          </div>
          {localError || error ? (
            <p role="alert" className="text-sm text-negative">
              {localError || error}
            </p>
          ) : null}
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('dismiss')}
            </Button>
            <Button
              type="button"
              disabled={pending || !campaign}
              className="gap-2"
              onClick={handleConfirm}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? t('saving') : t('confirm')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
