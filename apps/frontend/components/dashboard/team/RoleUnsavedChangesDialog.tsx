'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type RoleUnsavedChangesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}

export function RoleUnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: RoleUnsavedChangesDialogProps) {
  const t = useTranslations('dashboard.roles.editor')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('unsavedConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('unsavedConfirm')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('unsavedConfirmStay')}
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            {t('unsavedConfirmDiscard')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
