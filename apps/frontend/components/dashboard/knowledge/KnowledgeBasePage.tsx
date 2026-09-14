'use client'

import { useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import {
  api,
  type ApiError,
  type KnowledgeDocument,
  type KnowledgeDocumentStatus,
} from '@/lib/api'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { queryKeys } from '@/lib/query-keys'
import {
  formatBytes,
  unwrapMediaQuota,
} from '@/components/dashboard/templates/media-utils'
import {
  formatKnowledgeDate,
  isKnowledgeInFlight,
  KNOWLEDGE_MAX_FILE_BYTES,
  KNOWLEDGE_UPLOAD_ACCEPT,
  resolveKnowledgeFileSource,
  titleFromFileName,
  unwrapKnowledgeCreate,
  unwrapKnowledgeList,
  type LifecycleFilter,
  type StatusFilter,
} from './knowledge-utils'

const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'PENDING',
  'PROCESSING',
  'INDEXED',
  'FAILED',
]

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'INDEXED':
      return 'bg-primary-pale text-positive-deep ring-1 ring-primary/25'
    case 'FAILED':
      return 'bg-destructive/10 text-destructive ring-1 ring-destructive/25'
    case 'PROCESSING':
      return 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/30'
    case 'PENDING':
    default:
      return 'bg-dash-surface text-mute ring-1 ring-dash-border'
  }
}

export function KnowledgeBasePage() {
  const t = useTranslations('dashboard.knowledge')
  const tMedia = useTranslations('dashboard.media')
  const locale = useLocale()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { tenantOrganizationId, permissions, isLoading: orgsLoading } = useOrganizations()

  const canView = hasPermission(permissions, PERMISSIONS.AI_KB_VIEW)
  const canManage = hasPermission(permissions, PERMISSIONS.AI_KB_MANAGE)

  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('active')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const listParams = useMemo(
    () => ({
      page,
      perPage: 20,
      lifecycle,
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    }),
    [page, lifecycle, statusFilter]
  )

  const listQuery = useQuery({
    queryKey: queryKeys.knowledge.list(tenantOrganizationId, listParams),
    enabled: Boolean(tenantOrganizationId) && canView && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.knowledgeDocuments.list({
        page: listParams.page,
        perPage: listParams.perPage,
        lifecycle: listParams.lifecycle,
        ...(listParams.status
          ? { status: listParams.status as KnowledgeDocumentStatus }
          : {}),
      })
      return unwrapKnowledgeList(data)
    },
    refetchInterval: (query) => {
      if (lifecycle === 'deleted') return false
      const items = query.state.data?.items ?? []
      return items.some((doc) => isKnowledgeInFlight(doc.status)) ? 3000 : false
    },
  })

  const quotaQuery = useQuery({
    queryKey: queryKeys.knowledge.quota(tenantOrganizationId),
    enabled: Boolean(tenantOrganizationId) && canView && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.media.quota()
      return unwrapMediaQuota(data)
    },
  })

  const invalidateKnowledgeAndQuota = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all }),
    ])
  }

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const resolved = resolveKnowledgeFileSource(file)
      if (!resolved) {
        throw new Error(t('errors.unsupportedType'))
      }
      if (file.size > KNOWLEDGE_MAX_FILE_BYTES) {
        throw new Error(t('errors.fileTooLarge'))
      }

      const { data: body } = await api.knowledgeDocuments.create({
        title: titleFromFileName(file.name).slice(0, 255),
        sourceType: resolved.sourceType,
        fileName: file.name.slice(0, 255),
        mimeType: resolved.mimeType,
        fileSize: file.size,
      })

      const { document, upload } = unwrapKnowledgeCreate(body)
      if (!document?.id || !upload?.url) {
        throw new Error(t('errors.uploadFailed'))
      }

      const put = await fetch(upload.url, {
        method: 'PUT',
        headers: upload.headers,
        body: file,
      })
      if (!put.ok) {
        throw new Error(t('errors.uploadFailed'))
      }

      await api.knowledgeDocuments.completeUpload(document.id)
    },
    onSuccess: async () => {
      setUploadError(null)
      setPage(1)
      setLifecycle('active')
      await invalidateKnowledgeAndQuota()
    },
    onError: (err) => {
      setUploadError((err as Error).message || t('errors.uploadFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.knowledgeDocuments.delete(id),
    onMutate: (id) => {
      setActionId(id)
    },
    onSuccess: async () => {
      setActionError(null)
      await invalidateKnowledgeAndQuota()
    },
    onError: (err) => {
      setActionError((err as unknown as ApiError).message || t('errors.deleteFailed'))
    },
    onSettled: () => {
      setActionId(null)
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.knowledgeDocuments.restore(id),
    onMutate: (id) => {
      setActionId(id)
    },
    onSuccess: async () => {
      setActionError(null)
      await invalidateKnowledgeAndQuota()
    },
    onError: (err) => {
      setActionError((err as unknown as ApiError).message || t('errors.restoreFailed'))
    },
    onSettled: () => {
      setActionId(null)
    },
  })

  const purgeMutation = useMutation({
    mutationFn: (id: string) => api.knowledgeDocuments.purge(id),
    onMutate: (id) => {
      setActionId(id)
    },
    onSuccess: async () => {
      setActionError(null)
      await invalidateKnowledgeAndQuota()
    },
    onError: (err) => {
      setActionError((err as unknown as ApiError).message || t('errors.purgeFailed'))
    },
    onSettled: () => {
      setActionId(null)
    },
  })

  const items = listQuery.data?.items ?? []
  const meta = listQuery.data?.meta
  const quota = quotaQuery.data
  const total = meta?.total ?? items.length
  const lastPage = meta?.lastPage ?? 1
  const perPage = meta?.perPage ?? 20
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  const busy =
    uploadFileMutation.isPending ||
    deleteMutation.isPending ||
    restoreMutation.isPending ||
    purgeMutation.isPending

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-mute uppercase">{t('eyebrow')}</p>
        <DashboardSectionHeader
          className="flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between"
          title={t('title')}
          description={t('subtitle')}
          action={
            canManage && lifecycle === 'active' ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={KNOWLEDGE_UPLOAD_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) uploadFileMutation.mutate(file)
                  }}
                />
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  {uploadFileMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-4" aria-hidden />
                  )}
                  {uploadFileMutation.isPending ? t('uploadProgress') : t('uploadCta')}
                </Button>
              </div>
            ) : undefined
          }
        />
      </div>

      {quota ? (
        <p className="text-sm text-mute">
          {tMedia('quotaLabel')}:{' '}
          <span className="font-medium text-ink">
            {tMedia('quotaValue', {
              used: formatBytes(quota.usedBytes),
              limit: formatBytes(quota.limitBytes),
            })}
          </span>
        </p>
      ) : null}

      {uploadError ? (
        <p role="alert" className="text-sm text-destructive">
          {uploadError}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <DashboardPanel className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-dash-border p-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['active', t('filters.active')],
                ['deleted', t('filters.deleted')],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={lifecycle === value ? 'default' : 'outline'}
                onClick={() => {
                  setLifecycle(value)
                  setPage(1)
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {lifecycle === 'active' ? (
            <>
              <p className="text-xs font-medium tracking-wide text-mute uppercase">
                {t('filters.label')}
              </p>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={statusFilter === value ? 'default' : 'outline'}
                    onClick={() => {
                      setStatusFilter(value)
                      setPage(1)
                    }}
                  >
                    {t(`filters.${value}`)}
                  </Button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {listQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-mute">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : listQuery.isError ? (
          <div className="space-y-3 p-8 text-center">
            <p role="alert" className="text-sm text-destructive">
              {(listQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void listQuery.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center sm:p-12">
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-dash-surface text-mute">
              <BookOpen className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-base font-medium text-ink">
              {lifecycle === 'deleted' ? t('emptyDeletedTitle') : t('emptyTitle')}
            </p>
            <p className="mt-1 text-sm text-mute">
              {lifecycle === 'deleted' ? t('emptyDeletedDescription') : t('emptyDescription')}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-dash-border">
            {items.map((doc) => (
              <KnowledgeDocumentRow
                key={doc.id}
                doc={doc}
                locale={locale}
                canManage={canManage}
                lifecycle={lifecycle}
                acting={actionId === doc.id}
                onDelete={() => deleteMutation.mutate(doc.id)}
                onRestore={() => restoreMutation.mutate(doc.id)}
                onPurge={() => purgeMutation.mutate(doc.id)}
              />
            ))}
          </ul>
        )}

        {total > 0 ? (
          <div className="flex flex-col gap-3 border-t border-dash-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-mute">{t('pagination', { from, to, total })}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('prev')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
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

function KnowledgeDocumentRow({
  doc,
  locale,
  canManage,
  lifecycle,
  acting,
  onDelete,
  onRestore,
  onPurge,
}: {
  doc: KnowledgeDocument
  locale: string
  canManage: boolean
  lifecycle: LifecycleFilter
  acting: boolean
  onDelete: () => void
  onRestore: () => void
  onPurge: () => void
}) {
  const t = useTranslations('dashboard.knowledge')
  const sourceKey = ['FILE_PDF', 'FILE_DOCX', 'FILE_TXT'].includes(doc.sourceType)
    ? doc.sourceType
    : 'UNKNOWN'
  const statusKey = ['PENDING', 'PROCESSING', 'INDEXED', 'FAILED'].includes(doc.status)
    ? doc.status
    : 'PENDING'

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-dash-surface text-mute">
          <FileText className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-ink">{doc.title}</p>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
                statusBadgeClass(doc.status)
              )}
            >
              {isKnowledgeInFlight(doc.status) ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : null}
              {t(`status.${statusKey}`)}
            </span>
          </div>
          <p className="text-xs leading-5 text-mute">
            {t(`source.${sourceKey}`)}
            {doc.status === 'INDEXED' ? ` · ${t('chunkCount', { count: doc.chunkCount })}` : null}
            {` · ${formatKnowledgeDate(doc.createdAt, locale)}`}
          </p>
          {doc.status === 'FAILED' && doc.errorMessage ? (
            <p className="text-xs leading-5 text-destructive">{doc.errorMessage}</p>
          ) : null}
        </div>
      </div>
      {canManage ? (
        <div className="flex shrink-0 flex-wrap gap-2 sm:pl-3">
          {lifecycle === 'active' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={acting}
              onClick={onDelete}
            >
              {acting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
              {t('actions.delete')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={acting}
                onClick={onRestore}
              >
                {acting ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                {t('actions.restore')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={acting}
                onClick={onPurge}
              >
                {acting ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                {t('actions.purge')}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  )
}
