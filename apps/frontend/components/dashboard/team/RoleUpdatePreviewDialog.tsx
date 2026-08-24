'use client'

import { useTranslations } from 'next-intl'
import { Loader2, Minus, Plus, Users } from 'lucide-react'
import type { RoleUpdatePreview } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { actionLabel, sortPermissions } from './role-editor-utils'

type RoleUpdatePreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  preview: RoleUpdatePreview | null
  resultingPermissions: string[]
  loading?: boolean
  error?: string | null
}

function PermissionChangeList({
  permissions,
  emptyLabel,
  tone,
}: {
  permissions: string[]
  emptyLabel: string
  tone: 'added' | 'removed'
}) {
  if (permissions.length === 0) {
    return <p className="text-sm text-mute">{emptyLabel}</p>
  }

  return (
    <ul className="max-h-40 space-y-1.5 overflow-y-auto">
      {sortPermissions(permissions).map((permission) => (
        <li
          key={permission}
          className="flex items-start gap-2 rounded-lg border border-dash-border bg-canvas px-2.5 py-2 text-sm"
        >
          {tone === 'added' ? (
            <Plus className="mt-0.5 size-3.5 shrink-0 text-positive-deep" aria-hidden />
          ) : (
            <Minus className="mt-0.5 size-3.5 shrink-0 text-negative" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="block font-medium text-ink">{actionLabel(permission)}</span>
            <span className="font-mono text-[11px] text-mute">{permission}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function RoleUpdatePreviewDialog({
  open,
  onOpenChange,
  preview,
  resultingPermissions,
  loading = false,
  error = null,
}: RoleUpdatePreviewDialogProps) {
  const t = useTranslations('dashboard.roles.editor.preview')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative">
            {error}
          </p>
        ) : preview ? (
          <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-dash-border bg-dash-surface/50 px-3 py-2.5">
              <p className="text-xs font-semibold tracking-wide text-mute uppercase">{t('role')}</p>
              <p className="mt-1 font-mono text-sm text-ink">{preview.role.toUpperCase()}</p>
              {preview.isSystem ? (
                <p className="mt-1 text-xs text-body">{t('systemRoleHint')}</p>
              ) : null}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ink">{t('resultingTitle')}</h3>
              <p className="mt-0.5 text-xs text-mute">
                {t('resultingCount', { count: resultingPermissions.length })}
              </p>
              {resultingPermissions.length === 0 ? (
                <p className="mt-2 text-sm text-mute">{t('resultingEmpty')}</p>
              ) : (
                <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-dash-border p-2">
                  {sortPermissions(resultingPermissions).map((permission) => (
                    <li key={permission} className="px-1.5 py-1 text-sm">
                      <span className="font-medium text-ink">{actionLabel(permission)}</span>
                      <span className="ml-2 font-mono text-[11px] text-mute">{permission}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  {t('addedTitle', { count: preview.permissionsAdded.length })}
                </h3>
                <div className="mt-2">
                  <PermissionChangeList
                    permissions={preview.permissionsAdded}
                    emptyLabel={t('addedEmpty')}
                    tone="added"
                  />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  {t('removedTitle', { count: preview.permissionsRemoved.length })}
                </h3>
                <div className="mt-2">
                  <PermissionChangeList
                    permissions={preview.permissionsRemoved}
                    emptyLabel={t('removedEmpty')}
                    tone="removed"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-dash-border bg-canvas px-3 py-2.5">
              <Users className="mt-0.5 size-4 shrink-0 text-body" aria-hidden />
              <div>
                <p className="text-sm font-medium text-ink">
                  {t('affectedTitle', { count: preview.affectedMembers.length })}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-body">
                  {preview.affectedMembers.length === 0
                    ? t('affectedNone')
                    : t('affectedHint')}
                </p>
              </div>
            </div>

            {preview.permissionsAdded.length === 0 &&
            preview.permissionsRemoved.length === 0 ? (
              <p className="text-sm text-body">{t('noChanges')}</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
