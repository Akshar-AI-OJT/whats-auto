'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { Campaign, CampaignPreview } from '@/lib/api'
import { Button } from '@/components/ui/button'
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
            <p className="flex items-center gap-2 text-sm text-body">
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
            <div className="rounded-xl border border-dash-border bg-dash-surface/60 px-4 py-3 text-sm leading-6 text-ink whitespace-pre-wrap">
              {preview.bodyPreview}
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
