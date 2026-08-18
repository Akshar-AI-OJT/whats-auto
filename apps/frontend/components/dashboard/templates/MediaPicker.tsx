'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { FileImage, FileText, Loader2 } from 'lucide-react'
import { api, type MediaAsset, type MediaAssetKind } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { mediaQueryKeys, unwrapMediaList, formatBytes } from './media-utils'

type MediaPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind?: MediaAssetKind
  onSelect: (asset: MediaAsset) => void
}

/**
 * Reusable Media Library picker for templates, inbox, campaigns, etc.
 */
export function MediaPicker({ open, onOpenChange, kind, onSelect }: MediaPickerProps) {
  const t = useTranslations('dashboard.media')
  const { tenantOrganizationId, isLoading: orgsLoading } = useOrganizations()
  const [page, setPage] = useState(1)

  const listParams = useMemo(
    () => ({
      page,
      perPage: 12,
      state: 'ready' as const,
      ...(kind ? { kind } : {}),
    }),
    [page, kind]
  )

  const listQuery = useQuery({
    queryKey: mediaQueryKeys.list(tenantOrganizationId, { ...listParams, picker: 1 }),
    enabled: open && Boolean(tenantOrganizationId) && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.media.list(listParams)
      return unwrapMediaList(data)
    },
  })

  const items = listQuery.data?.items ?? []
  const meta = listQuery.data?.meta
  const lastPage = meta?.lastPage ?? 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('pickerTitle')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-mute">
              <Loader2 className="size-4 animate-spin" />
              {t('loading')}
            </div>
          ) : items.length === 0 ? (
            <p className="p-10 text-center text-sm text-mute">{t('pickerEmpty')}</p>
          ) : (
            <ul className="divide-y divide-dash-border">
              {items.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-dash-surface text-mute">
                      {asset.kind === 'image' ? (
                        <FileImage className="size-4" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{asset.fileName}</p>
                      <p className="text-xs text-mute">{formatBytes(asset.fileSize)}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onSelect(asset)
                      onOpenChange(false)
                    }}
                  >
                    {t('actions.select')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lastPage > 1 ? (
          <div className="flex justify-end gap-2 border-t border-dash-border px-5 py-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('prev')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('next')}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
