'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import { api, type ApiError } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { TemplateStatusBadge } from './TemplateStatusBadge'
import { TemplatePreview, templateToPreviewProps } from './TemplatePreview'
import { TemplateDeleteDialog } from './TemplateDialogs'
import { templateQueryKeys } from './TemplatesListPage'
import {
  buildSubmissionHistory,
  extractBodyVariables,
  formatRelativeDate,
  formatTemplateCategory,
  formatTemplateLanguage,
  normalizeButtons,
  unwrapTemplate,
} from './template-utils'

export function TemplateDetailsPage({ templateId }: { templateId: string }) {
  const t = useTranslations('dashboard.templates')
  const router = useRouter()
  const queryClient = useQueryClient()
  const { canViewWhatsapp, canManageWhatsapp, isLoading: orgsLoading } = useOrganizations()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: templateQueryKeys.detail(templateId),
    enabled: Boolean(templateId) && canViewWhatsapp && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.whatsapp.getTemplate(templateId)
      return unwrapTemplate(data)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.whatsapp.deleteTemplate(templateId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateQueryKeys.all })
      router.push('/dashboard/templates')
    },
    onError: (err) => {
      setDeleteError((err as unknown as ApiError).message || t('errors.deleteFailed'))
    },
  })

  if (!orgsLoading && !canViewWhatsapp) {
    return (
      <DashboardPanel className="mx-auto max-w-[1200px] px-4 py-5">
        <p className="text-sm text-negative">{t('errors.permissionDenied')}</p>
      </DashboardPanel>
    )
  }

  if (detailQuery.isLoading || orgsLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-center gap-2 py-24 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <DashboardPanel className="mx-auto max-w-[1200px] px-4 py-5">
        <p className="text-sm text-negative">
          {(detailQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/dashboard/templates')}
        >
          {t('backToList')}
        </Button>
      </DashboardPanel>
    )
  }

  const template = detailQuery.data
  const variables = extractBodyVariables(template.bodyText)
  const buttons = normalizeButtons(template.buttons)
  const history = buildSubmissionHistory(template)
  const statusKey = template.status.toLowerCase()
  const statusLabel =
    statusKey === 'approved'
      ? t('status.approved')
      : statusKey === 'pending'
        ? t('status.pending')
        : statusKey === 'rejected'
          ? t('status.rejected')
          : statusKey === 'draft'
            ? t('status.draft')
            : template.status

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[1.7rem] tracking-tight text-ink sm:text-[1.95rem]">
                {template.name}
              </h1>
              <TemplateStatusBadge status={template.status} label={statusLabel} />
              <span className="rounded-md bg-dash-surface px-2 py-0.5 text-[11px] font-semibold text-body">
                {formatTemplateCategory(String(template.category))}
              </span>
            </div>
            <p className="mt-2 text-sm text-body">{formatTemplateLanguage(template.language)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/templates')}
            >
              {t('backToList')}
            </Button>
            {canManageWhatsapp ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => router.push(`/dashboard/templates/create?from=${template.id}`)}
              >
                <Pencil className="size-4" aria-hidden />
                {t('actions.edit')}
              </Button>
            ) : null}
            {canManageWhatsapp ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-negative/30 text-negative hover:bg-negative/5"
                onClick={() => {
                  setDeleteError(null)
                  setDeleteOpen(true)
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                {t('actions.delete')}
              </Button>
            ) : null}
          </div>
        </div>
      </DashboardPanel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <DashboardPanel className="p-4 sm:p-5">
            <h2 className="text-base font-semibold text-ink">{t('details.content')}</h2>
            <div className="mt-4 space-y-4 text-sm">
              {template.headerContent ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('details.header')}
                  </p>
                  <p className="mt-1 text-ink">{template.headerContent}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                  {t('details.body')}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-ink">{template.bodyText}</p>
              </div>
              {template.footerText ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('details.footer')}
                  </p>
                  <p className="mt-1 text-ink">{template.footerText}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                  {t('details.variables')}
                </p>
                {variables.length === 0 ? (
                  <p className="mt-1 text-body">{t('details.noVariables')}</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {variables.map((variable) => (
                      <span
                        key={variable}
                        className="rounded-md bg-dash-surface px-2 py-0.5 font-mono text-xs text-ink"
                      >
                        {`{{${variable}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                  {t('details.buttons')}
                </p>
                {buttons.length === 0 ? (
                  <p className="mt-1 text-body">{t('details.noButtons')}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {buttons.map((button, index) => (
                      <li
                        key={`${button.text}-${index}`}
                        className="rounded-lg border border-dash-border px-3 py-2 text-ink"
                      >
                        <span className="font-medium">{button.text || t('preview.buttonFallback')}</span>
                        <span className="ml-2 text-xs text-mute">{button.type}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel className="p-4 sm:p-5">
            <h2 className="text-base font-semibold text-ink">{t('details.history')}</h2>
            <ol className="mt-4 space-y-3 border-l border-dash-border pl-4">
              {history.map((event) => (
                <li key={event.key} className="relative">
                  <span className="absolute top-1.5 -left-[1.35rem] size-2.5 rounded-full bg-primary" />
                  <p className="text-sm font-medium text-ink">
                    {t(`details.historyEvents.${event.labelKey}`)}
                  </p>
                  <p className="text-xs text-mute">{formatRelativeDate(event.at)}</p>
                </li>
              ))}
            </ol>
            {template.rejectionReason || template.submissionError ? (
              <div className="mt-4 rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative">
                {template.rejectionReason || template.submissionError}
              </div>
            ) : null}
          </DashboardPanel>
        </div>

        <div className="space-y-5">
          <DashboardPanel className="p-4 sm:p-5">
            <h2 className="text-base font-semibold text-ink">{t('details.statusCard')}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-mute">{t('table.status')}</dt>
                <dd>
                  <TemplateStatusBadge status={template.status} label={statusLabel} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">{t('table.category')}</dt>
                <dd className="text-ink">{formatTemplateCategory(String(template.category))}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">{t('table.language')}</dt>
                <dd className="text-ink">{formatTemplateLanguage(template.language)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">{t('details.templateId')}</dt>
                <dd className="font-mono text-xs text-ink">{template.id.slice(0, 8)}…</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">{t('table.updated')}</dt>
                <dd className="text-ink">
                  {formatRelativeDate(template.updatedAt ?? template.createdAt)}
                </dd>
              </div>
            </dl>
          </DashboardPanel>

          <TemplatePreview {...templateToPreviewProps(template)} />
        </div>
      </div>

      <TemplateDeleteDialog
        open={deleteOpen}
        template={template}
        pending={deleteMutation.isPending}
        error={deleteError}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
