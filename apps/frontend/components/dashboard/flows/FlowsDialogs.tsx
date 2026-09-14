'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type {
  ConversationFlow,
  ConversationFlowTriggerType,
  ConversationFlowValidationError,
} from '@/lib/api'
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

const CREATE_TRIGGER_TYPES: ConversationFlowTriggerType[] = ['KEYWORD', 'INBOUND_ANY']

const selectClassName =
  'h-12 w-full rounded-md border border-ink bg-canvas px-4 text-base text-ink outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-primary/50'

type FlowsCreateDialogProps = {
  open: boolean
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: {
    name: string
    description: string | null
    triggerType: ConversationFlowTriggerType
    keywords: string
  }) => void
}

export function FlowsCreateDialog({
  open,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: FlowsCreateDialogProps) {
  const t = useTranslations('dashboard.flows')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<ConversationFlowTriggerType>('KEYWORD')
  const [keywords, setKeywords] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [keywordsError, setKeywordsError] = useState<string | null>(null)
  const formKey = open ? 'open' : 'closed'
  const [hydratedKey, setHydratedKey] = useState(formKey)
  if (formKey !== hydratedKey) {
    setHydratedKey(formKey)
    setName('')
    setDescription('')
    setTriggerType('KEYWORD')
    setKeywords('')
    setNameError(null)
    setKeywordsError(null)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(t('create.errors.nameRequired'))
      return
    }
    if (triggerType === 'KEYWORD' && !keywords.trim()) {
      setKeywordsError(t('create.errors.keywordsRequired'))
      return
    }
    setNameError(null)
    setKeywordsError(null)
    onSubmit({
      name: trimmed,
      description: description.trim() || null,
      triggerType,
      keywords,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>{t('create.title')}</DialogTitle>
            <DialogDescription>{t('create.subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4 sm:px-6">
            <div className="space-y-2">
              <label htmlFor="flow-name" className="text-sm font-medium text-ink">
                {t('create.name')}
              </label>
              <Input
                id="flow-name"
                value={name}
                maxLength={255}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('create.namePlaceholder')}
                disabled={pending}
              />
              {nameError ? <p className="text-xs text-negative">{nameError}</p> : null}
            </div>
            <div className="space-y-2">
              <label htmlFor="flow-description" className="text-sm font-medium text-ink">
                {t('create.description')}
              </label>
              <Input
                id="flow-description"
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('create.descriptionPlaceholder')}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="flow-trigger" className="text-sm font-medium text-ink">
                {t('create.triggerType')}
              </label>
              <select
                id="flow-trigger"
                className={selectClassName}
                value={triggerType}
                disabled={pending}
                onChange={(e) => setTriggerType(e.target.value as ConversationFlowTriggerType)}
              >
                {CREATE_TRIGGER_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`triggerType.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            {triggerType === 'KEYWORD' ? (
              <div className="space-y-2">
                <label htmlFor="flow-keywords" className="text-sm font-medium text-ink">
                  {t('create.keywords')}
                </label>
                <Input
                  id="flow-keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder={t('create.keywordsPlaceholder')}
                  disabled={pending}
                />
                {keywordsError ? <p className="text-xs text-negative">{keywordsError}</p> : null}
              </div>
            ) : null}
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
                {t('create.cancel')}
              </Button>
              <Button type="submit" disabled={pending} className="gap-2">
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {pending ? t('create.saving') : t('create.submit')}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type FlowsDeleteDialogProps = {
  open: boolean
  flow: ConversationFlow | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function FlowsDeleteDialog({
  open,
  flow,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: FlowsDeleteDialogProps) {
  const t = useTranslations('dashboard.flows.delete')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body', { name: flow?.name ?? '' })}</DialogDescription>
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
              disabled={pending || !flow}
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

type FlowsPublishDialogProps = {
  open: boolean
  flow: ConversationFlow | null
  pending: boolean
  error: string | null
  validationErrors: ConversationFlowValidationError[]
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function FlowsPublishDialog({
  open,
  flow,
  pending,
  error,
  validationErrors,
  onOpenChange,
  onConfirm,
}: FlowsPublishDialogProps) {
  const t = useTranslations('dashboard.flows.publish')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body', { name: flow?.name ?? '' })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          {validationErrors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-negative">
              {validationErrors.map((item, index) => (
                <li key={`${item.code ?? 'err'}-${index}`}>
                  {item.message || item.code || t('invalid')}
                </li>
              ))}
            </ul>
          ) : null}
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
              disabled={pending || !flow}
              className="gap-2"
              onClick={onConfirm}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? t('publishing') : t('confirm')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
