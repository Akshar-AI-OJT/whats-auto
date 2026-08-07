'use client'

import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { FileImage, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import {
  api,
  type ApiError,
  type MediaAsset,
  type MediaAssetKind,
  type MediaQuota,
} from '@/lib/api'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  formatBytes,
  MEDIA_UPLOAD_ACCEPT,
  mediaQueryKeys,
  resolveUploadMimeType,
  unwrapMediaList,
} from './media-utils'

type KindFilter = 'all' | MediaAssetKind
type StateFilter = 'ready' | 'deleted'

export function MediaLibraryPage() {
  const t = useTranslations('dashboard.media')
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { tenantOrganizationId, permissions, isLoading: orgsLoading } = useOrganizations()

  const canView = hasPermission(permissions, PERMISSIONS.MEDIA_VIEW)
  const canUpload = hasPermission(permissions, PERMISSIONS.MEDIA_UPLOAD)
  const canDelete = hasPermission(permissions, PERMISSIONS.MEDIA_DELETE)
  const canPurge = hasPermission(permissions, PERMISSIONS.MEDIA_PURGE)

  const [kind, setKind] = useState<KindFilter>('all')
  const [state, setState] = useState<StateFilter>('ready')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const listParams = useMemo(
    () => ({
      page,
      perPage: 20,
      state,
      ...(kind !== 'all' ? { kind } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [page, state, kind, search]
  )

  const listQuery = useQuery({
    queryKey: mediaQueryKeys.list(tenantOrganizationId, listParams),
    enabled: Boolean(tenantOrganizationId) && canView && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.media.list(listParams)
      return unwrapMediaList(data)
    },
  })

  const quotaQuery = useQuery({
    queryKey: mediaQueryKeys.quota(tenantOrganizationId),
    enabled: Boolean(tenantOrganizationId) && canView && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.media.quota()
      return (data?.usedBytes != null ? data : data) as MediaQuota
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const mimeType = resolveUploadMimeType(file)
      if (!mimeType) {
        throw new Error(t('errors.unsupportedType'))
      }

      const { data: body } = await api.media.initiateUpload({
        fileName: file.name,
        mimeType,
        fileSize: file.size,
      })

      // API returns `{ data: { asset, upload } }`; protectedRequest keeps the outer JSON.
      const root = body as {
        data?: {
          asset?: MediaAsset
          upload?: { url: string; headers: Record<string, string> }
        }
        asset?: MediaAsset
        upload?: { url: string; headers: Record<string, string> }
      }
      const initiated = root.data?.upload ? root.data : root
      const upload = initiated.upload
      const asset = initiated.asset

      if (!upload?.url || !asset?.id) {
        throw new Error(t('errors.uploadFailed'))
      }

      const put = await fetch(upload.url, {
        method: 'PUT',
        headers: upload.headers ?? {},
        body: file,
      })
      if (!put.ok) {
        throw new Error(t('errors.uploadFailed'))
      }

      await api.media.completeUpload(asset.id)
    },
    onSuccess: async () => {
      setUploadError(null)
      await queryClient.invalidateQueries({ queryKey: mediaQueryKeys.all })
    },
    onError: (err) => {
      setUploadError((err as Error).message || t('errors.uploadFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.media.softDelete(id),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: mediaQueryKeys.all })
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError
      setActionError(
        apiErr.code === 'E_MEDIA_HAS_REFERENCES'
          ? t('errors.referenced')
          : apiErr.message || t('errors.deleteFailed')
      )
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.media.restore(id),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: mediaQueryKeys.all })
    },
    onError: (err) => {
      setActionError((err as unknown as ApiError).message || t('errors.restoreFailed'))
    },
  })

  const purgeMutation = useMutation({
    mutationFn: (id: string) => api.media.purge(id),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: mediaQueryKeys.all })
    },
    onError: (err) => {
      setActionError((err as unknown as ApiError).message || t('errors.purgeFailed'))
    },
  })

  const items = listQuery.data?.items ?? []
  const meta = listQuery.data?.meta
  const total = meta?.total ?? items.length
  const lastPage = meta?.lastPage ?? 1
  const from = total === 0 ? 0 : (page - 1) * (meta?.perPage ?? 20) + 1
  const to = Math.min(page * (meta?.perPage ?? 20), total)
  const quota = quotaQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-mute">{t('eyebrow')}</p>
        <DashboardSectionHeader
          title={t('title')}
          description={t('subtitle')}
          action={
            canUpload ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={MEDIA_UPLOAD_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) uploadMutation.mutate(file)
                  }}
                />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {uploadMutation.isPending ? t('uploadProgress') : t('uploadCta')}
                </Button>
              </>
            ) : undefined
          }
        />
      </div>

      {quota ? (
        <p className="text-sm text-mute">
          {t('quotaLabel')}:{' '}
          <span className="font-medium text-ink">
            {t('quotaValue', {
              used: formatBytes(quota.usedBytes),
              limit: formatBytes(quota.limitBytes),
            })}
          </span>
        </p>
      ) : null}

      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

      <DashboardPanel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-dash-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', t('filters.all')],
                ['image', t('filters.images')],
                ['document', t('filters.documents')],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={kind === value ? 'default' : 'outline'}
                onClick={() => {
                  setKind(value)
                  setPage(1)
                }}
              >
                {label}
              </Button>
            ))}
            {(
              [
                ['ready', t('filters.ready')],
                ['deleted', t('filters.deleted')],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={state === value ? 'default' : 'outline'}
                onClick={() => {
                  setState(value)
                  setPage(1)
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('filters.searchPlaceholder')}
            className="max-w-xs"
          />
        </div>

        {listQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-mute">
            <Loader2 className="size-4 animate-spin" />
            {t('loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-base font-medium text-ink">{t('emptyTitle')}</p>
            <p className="mt-1 text-sm text-mute">{t('emptyDescription')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-dash-border">
            {items.map((asset) => (
              <li
                key={asset.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-dash-surface text-mute">
                    {asset.kind === 'image' ? (
                      <FileImage className="size-4" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{asset.fileName}</p>
                    <p className="text-xs text-mute">
                      {t(`kind.${asset.kind}`)} · {formatBytes(asset.fileSize)} · {asset.state}
                      {asset.referenceCount ? ` · refs ${asset.referenceCount}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(asset.deliveryUrl, '_blank', 'noopener,noreferrer')}
                  >
                    {t('actions.preview')}
                  </Button>
                  {state === 'ready' && canDelete ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => deleteMutation.mutate(asset.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-3.5" />
                      {t('actions.delete')}
                    </Button>
                  ) : null}
                  {state === 'deleted' && canDelete ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => restoreMutation.mutate(asset.id)}
                      disabled={restoreMutation.isPending}
                    >
                      {t('actions.restore')}
                    </Button>
                  ) : null}
                  {state === 'deleted' && canPurge ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => purgeMutation.mutate(asset.id)}
                      disabled={purgeMutation.isPending}
                    >
                      {t('actions.purge')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {total > 0 ? (
          <div className="flex items-center justify-between border-t border-dash-border px-4 py-3">
            <p className="text-sm text-mute">{t('pagination', { from, to, total })}</p>
            <div className="flex gap-2">
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
          </div>
        ) : null}
      </DashboardPanel>
    </div>
  )
}
