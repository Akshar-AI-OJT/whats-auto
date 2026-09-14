'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { CustomerGroup } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type CustomerGroupDeleteDialogProps = {
  open: boolean
  group: CustomerGroup | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function CustomerGroupDeleteDialog({
  open,
  group,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: CustomerGroupDeleteDialogProps) {
  const t = useTranslations('dashboard.customerGroups.delete')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body', { name: group?.name ?? '' })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          <p className="rounded-xl border border-dash-border bg-dash-surface/60 px-3 py-2 text-sm text-body">
            {t('contactsSafe')}
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
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !group}
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
