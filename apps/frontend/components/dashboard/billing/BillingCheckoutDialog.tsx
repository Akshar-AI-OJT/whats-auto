'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type BillingCheckoutDialogProps = {
  open: boolean
  pending: boolean
  error: string | null
  planName: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function BillingCheckoutDialog({
  open,
  pending,
  error,
  planName,
  onOpenChange,
  onConfirm,
}: BillingCheckoutDialogProps) {
  const t = useTranslations('dashboard.billing.checkout')

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          <p className="rounded-xl border border-dash-border bg-dash-surface/50 px-4 py-3 text-sm font-medium text-ink">
            {planName}
          </p>

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
            <Button type="button" disabled={pending} className="gap-2" onClick={onConfirm}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? t('starting') : t('confirm')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
