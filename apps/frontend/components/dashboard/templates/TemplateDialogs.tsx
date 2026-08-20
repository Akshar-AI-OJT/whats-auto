'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { WhatsappMessageTemplate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type TemplateDeleteDialogProps = {
  open: boolean
  template: WhatsappMessageTemplate | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function TemplateDeleteDialog({
  open,
  template,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: TemplateDeleteDialogProps) {
  const t = useTranslations('dashboard.templates.delete')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body', { name: template?.name ?? '' })}</DialogDescription>
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
              disabled={pending || !template}
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

type TemplateSyncDialogProps = {
  open: boolean
  pending: boolean
  progress: number
  syncedCount: number | null
  error: string | null
  onOpenChange: (open: boolean) => void
  onRetry: () => void
}

export function TemplateSyncDialog({
  open,
  pending,
  progress,
  syncedCount,
  error,
  onOpenChange,
  onRetry,
}: TemplateSyncDialogProps) {
  const t = useTranslations('dashboard.templates.sync')

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-center sm:px-6">
          <DialogTitle>
            {pending ? t('syncingTitle') : error ? t('failedTitle') : t('doneTitle')}
          </DialogTitle>
          <DialogDescription>
            {pending
              ? t('syncingDescription')
              : error
                ? error
                : t('doneDescription', { count: syncedCount ?? 0 })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="h-2 overflow-hidden rounded-full bg-dash-surface">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-dash-border bg-dash-surface/50 px-3 py-3 text-center">
              <p className="text-xs text-mute">{t('importedLabel')}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{syncedCount ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-dash-border bg-dash-surface/50 px-3 py-3 text-center">
              <p className="text-xs text-mute">{t('statusLabel')}</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {pending ? t('statusRunning') : error ? t('statusFailed') : t('statusDone')}
              </p>
            </div>
          </div>
          {pending ? (
            <p className="text-center text-xs font-medium text-positive-deep">{t('dontClose')}</p>
          ) : (
            <div className="flex justify-end gap-2">
              {error ? (
                <Button type="button" variant="outline" onClick={onRetry}>
                  {t('retry')}
                </Button>
              ) : null}
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t('close')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function useSyncProgress(active: boolean) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!active) return

    // Start at 12% on the first interval tick then advance randomly.
    let first = true
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (first) {
          first = false
          return 12
        }
        if (prev >= 90) return prev
        return prev + Math.floor(Math.random() * 8) + 3
      })
    }, 450)

    return () => {
      window.clearInterval(timer)
      // Reset progress synchronously on cleanup (unmount or active→false).
      setProgress(0)
    }
  }, [active])

  return {
    progress,
    complete: () => setProgress(100),
  }
}
