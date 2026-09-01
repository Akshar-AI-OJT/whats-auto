'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { ContactSummary } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ContactDeleteDialogProps = {
  contact: ContactSummary | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ContactDeleteDialog({
  contact,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: ContactDeleteDialogProps) {
  const t = useTranslations('dashboard.contacts')
  const name = contact?.name?.trim() || contact?.phone || ''

  return (
    <Dialog
      open={Boolean(contact)}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open)
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('deleteConfirmBody', { name })}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="px-5 pt-4 text-sm text-negative sm:px-6">
            {error}
          </p>
        ) : null}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('deleteCancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            className="gap-2"
            onClick={onConfirm}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t('deleting')}
              </>
            ) : (
              t('deleteConfirm')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
