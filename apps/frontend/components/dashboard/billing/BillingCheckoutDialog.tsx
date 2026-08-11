'use client'

import { useEffect, useState } from 'react'
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { isValidPlanId } from './billing-utils'

type BillingCheckoutDialogProps = {
  open: boolean
  pending: boolean
  error: string | null
  initialPlanId?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (planId: string) => void
}

export function BillingCheckoutDialog({
  open,
  pending,
  error,
  initialPlanId = '',
  onOpenChange,
  onConfirm,
}: BillingCheckoutDialogProps) {
  const t = useTranslations('dashboard.billing.checkout')
  const [planId, setPlanId] = useState(initialPlanId)
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPlanId(initialPlanId)
      setFieldError(null)
    }
  }, [open, initialPlanId])

  function handleConfirm() {
    const trimmed = planId.trim()
    if (!isValidPlanId(trimmed)) {
      setFieldError(t('planIdInvalid'))
      return
    }
    setFieldError(null)
    onConfirm(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          <Field data-invalid={Boolean(fieldError)} className="gap-2">
            <FieldLabel>{t('planId')}</FieldLabel>
            <Input
              value={planId}
              disabled={pending}
              placeholder={t('planIdPlaceholder')}
              onChange={(e) => {
                setPlanId(e.target.value)
                setFieldError(null)
              }}
            />
            <FieldDescription>{t('planIdHint')}</FieldDescription>
            {fieldError ? <FieldError>{fieldError}</FieldError> : null}
          </Field>

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
            <Button type="button" disabled={pending} className="gap-2" onClick={handleConfirm}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? t('starting') : t('confirm')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
