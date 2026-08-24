'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { flowStatusBadgeClass } from './flow-utils'

export function FlowToolbar({
  name,
  status,
  dirty,
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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dash-border bg-canvas px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/dashboard/flows"
          className={cn(
            'inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-ink bg-canvas px-4 text-sm font-semibold text-ink',
            'hover:bg-canvas-soft'
          )}
        >
          {t('editor.back')}
        </Link>
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={readOnly || !canSave}
          className="h-10 max-w-sm rounded-xl"
          aria-label={t('create.name')}
        />
        <span
          className={cn(
            'inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase',
            flowStatusBadgeClass(status)
          )}
        >
          {t(`status.${statusKey}`)}
        </span>
        {dirty ? <span className="text-xs text-mute">{t('editor.unsaved')}</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
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
          <Button type="button" size="sm" disabled={readOnly || busy} onClick={onPublish}>
            {publishing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t('actions.publish')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
