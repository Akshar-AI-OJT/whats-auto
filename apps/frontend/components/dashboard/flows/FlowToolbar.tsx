'use client'

import { ArrowLeft, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  flowStatusBadgeClass,
  flowValidationBadgeClass,
  type FlowValidationState,
} from './flow-utils'

export function FlowToolbar({
  name,
  status,
  dirty,
  validationState,
  validationErrorCount,
  readOnly,
  canSave,
  canPublish,
  saving,
  validating,
  publishing,
  settingsOpen,
  onNameChange,
  onSave,
  onValidate,
  onPublish,
  onToggleSettings,
}: {
  name: string
  status: string
  dirty: boolean
  validationState: FlowValidationState
  validationErrorCount: number
  readOnly: boolean
  canSave: boolean
  canPublish: boolean
  saving: boolean
  validating: boolean
  publishing: boolean
  settingsOpen: boolean
  onNameChange: (value: string) => void
  onSave: () => void
  onValidate: () => void
  onPublish: () => void
  onToggleSettings: () => void
}) {
  const t = useTranslations('dashboard.flows')
  const statusKey = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status) ? status : 'DRAFT'
  const busy = saving || validating || publishing
  const publishEnabled = !readOnly && !busy && validationState === 'valid'
  const validationLabel =
    validationState === 'valid'
      ? t('editor.validation.valid')
      : validationState === 'invalid'
        ? t('editor.validation.invalid', { count: validationErrorCount })
        : t('editor.validation.unknown')

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dash-border bg-canvas px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Link
          href="/dashboard/flows"
          className={cn(
            'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-ink bg-canvas px-3 text-sm font-semibold text-ink',
            'hover:bg-canvas-soft'
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('editor.back')}
        </Link>
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={readOnly || !canSave}
          className="h-10 min-w-0 max-w-sm flex-1 rounded-xl sm:max-w-xs"
          aria-label={t('create.name')}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase',
              flowStatusBadgeClass(status)
            )}
          >
            {t(`status.${statusKey}`)}
          </span>
          <span
            className={cn(
              'inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide',
              flowValidationBadgeClass(validationState)
            )}
          >
            {validationLabel}
          </span>
          {dirty ? <span className="text-xs text-mute">{t('editor.unsaved')}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant={settingsOpen ? 'default' : 'outline'}
          onClick={onToggleSettings}
        >
          {t('editor.settings')}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onValidate}>
          {validating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t('editor.validate')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={readOnly || !canSave || busy || !dirty}
          onClick={onSave}
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t('editor.save')}
        </Button>
        {canPublish ? (
          <Button
            type="button"
            size="sm"
            disabled={!publishEnabled}
            title={
              validationState === 'valid' ? undefined : t('editor.validation.publishDisabled')
            }
            onClick={onPublish}
          >
            {publishing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('actions.publish')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
