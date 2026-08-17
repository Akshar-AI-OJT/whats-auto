'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { ContactSummary, CustomerGroup, CustomerGroupStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CustomerGroupContactPicker } from './CustomerGroupContactPicker'

type CustomerGroupFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  group?: CustomerGroup | null
  contacts: ContactSummary[]
  contactsLoading: boolean
  contactsError: string | null
  onRetryContacts: () => void
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: {
    name: string
    description: string
    status: CustomerGroupStatus
    contactIds: string[]
  }) => void
}

export function CustomerGroupFormDialog({
  open,
  mode,
  group,
  contacts,
  contactsLoading,
  contactsError,
  onRetryContacts,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: CustomerGroupFormDialogProps) {
  const t = useTranslations('dashboard.customerGroups.form')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<CustomerGroupStatus>('active')
  const [contactIds, setContactIds] = useState<string[]>([])
  const [nameError, setNameError] = useState<string | null>(null)
  const formKey = open ? `${mode}:${group?.id ?? 'new'}:${group?.updatedAt ?? ''}` : 'closed'
  const [hydratedKey, setHydratedKey] = useState(formKey)
  if (formKey !== hydratedKey) {
    setHydratedKey(formKey)
    setName(group?.name ?? '')
    setDescription(group?.description ?? '')
    setStatus(group?.status ?? 'active')
    setContactIds(group?.contactIds ?? [])
    setNameError(null)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(t('errors.nameRequired'))
      return
    }
    if (trimmed.length > 120) {
      setNameError(t('errors.nameTooLong'))
      return
    }
    setNameError(null)
    onSubmit({
      name: trimmed,
      description: description.trim(),
      status,
      contactIds,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(96vh,100%)] max-h-[96vh] w-[min(96vw,100%)] max-w-none gap-0 overflow-hidden p-0"
        showCloseButton
        size="fullscreen"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>{mode === 'edit' ? t('editTitle') : t('createTitle')}</DialogTitle>
            <DialogDescription>
              {mode === 'edit' ? t('editSubtitle') : t('createSubtitle')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-5 py-4 sm:px-6 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.4fr)] lg:overflow-hidden">
            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="customer-group-name" className="text-sm font-medium text-ink">
                  {t('name')}
                </label>
                <Input
                  id="customer-group-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  disabled={pending}
                />
                <div className="flex justify-between text-xs text-mute">
                  <span>{nameError ? <span className="text-negative">{nameError}</span> : null}</span>
                  <span>{name.length}/120</span>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="customer-group-description" className="text-sm font-medium text-ink">
                  {t('description')}
                </label>
                <textarea
                  id="customer-group-description"
                  value={description}
                  maxLength={500}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('descriptionPlaceholder')}
                  disabled={pending}
                  rows={6}
                  className="min-h-32 w-full rounded-md border border-dash-border bg-canvas px-3 py-2 text-sm text-ink outline-none transition-[border-color,box-shadow] hover:border-dash-border-strong focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30"
                />
                <p className="text-right text-xs text-mute">{description.length}/500</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="customer-group-status" className="text-sm font-medium text-ink">
                  {t('status')}
                </label>
                <select
                  id="customer-group-status"
                  className="h-11 w-full rounded-md border border-dash-border bg-canvas px-3 text-sm text-ink"
                  value={status}
                  disabled={pending}
                  onChange={(e) => setStatus(e.target.value as CustomerGroupStatus)}
                >
                  <option value="active">{t('statusActive')}</option>
                  <option value="inactive">{t('statusInactive')}</option>
                </select>
              </div>
            </div>

            <div className="flex min-h-0 flex-col space-y-2">
              <p className="text-sm font-medium text-ink">{t('selectContacts')}</p>
              <p className="text-xs text-mute">{t('selectContactsHint')}</p>
              <CustomerGroupContactPicker
                contacts={contacts}
                selectedIds={contactIds}
                onChange={setContactIds}
                loading={contactsLoading}
                error={contactsError}
                onRetry={onRetryContacts}
                disabled={pending}
              />
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="mx-5 mb-3 rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative sm:mx-6"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter className="border-t border-dash-border sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending} className="gap-2">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? t('saving') : mode === 'edit' ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
