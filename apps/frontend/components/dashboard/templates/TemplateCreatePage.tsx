'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type CreateWhatsappTemplateBody,
} from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { useRouter } from '@/i18n/navigation'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { TemplateForm, type TemplateFormValues } from './TemplateForm'
import { templateQueryKeys } from './TemplatesListPage'
import { normalizeButtons, unwrapTemplate } from './template-utils'

/** Avoid useSearchParams — hard refresh can stall pages that suspend on it. */
function readDuplicateFromId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search).get('from')
  } catch {
    return null
  }
}

export function TemplateCreatePage() {
  const t = useTranslations('dashboard.templates')
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    canManageWhatsapp,
    isLoading: orgsLoading,
  } = useOrganizations()
  const [fromId, setFromId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFromId(readDuplicateFromId())
  }, [])

  const sourceQuery = useQuery({
    queryKey: templateQueryKeys.detail(fromId ?? 'none'),
    enabled: Boolean(fromId) && canManageWhatsapp,
    queryFn: async () => {
      const { data } = await api.whatsapp.getTemplate(fromId!)
      return unwrapTemplate(data)
    },
  })

  const initialValues = useMemo<Partial<TemplateFormValues> | undefined>(() => {
    const template = sourceQuery.data
    if (!template) return undefined
    const sample =
      template.sampleValues && typeof template.sampleValues === 'object'
        ? (template.sampleValues as Record<string, string>)
        : {}
    return {
      name: `${template.name}_copy`,
      category: (String(template.category).toUpperCase() as TemplateFormValues['category']) || 'UTILITY',
      language: template.language || 'en_US',
      headerType:
        (String(template.headerType || 'NONE').toUpperCase() as TemplateFormValues['headerType']) ||
        'NONE',
      headerContent: template.headerContent || '',
      bodyText: template.bodyText || '',
      footerText: template.footerText || '',
      buttons: normalizeButtons(template.buttons),
      sampleValues: sample,
    }
  }, [sourceQuery.data])

  const createMutation = useMutation({
    mutationFn: async (body: CreateWhatsappTemplateBody) => {
      console.log('[templates] outgoing createTemplate payload', body)
      const { data } = await api.whatsapp.createTemplate(body)
      return unwrapTemplate(data)
    },
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: templateQueryKeys.all })
      if (template?.id) router.push(`/dashboard/templates/${template.id}`)
      else router.push('/dashboard/templates')
    },
    onError: (err) => {
      const apiError = err as unknown as ApiError
      if (apiError.code === 'E_MESSAGE_TEMPLATE_DUPLICATE') {
        setError(t('errors.duplicate'))
        return
      }
      setError(apiError.message || t('errors.createFailed'))
    },
  })

  if (!orgsLoading && !canManageWhatsapp) {
    return (
      <div className="mx-auto w-full max-w-[1200px]">
        <DashboardPanel className="px-4 py-5 sm:px-6">
          <p className="text-sm text-negative">{t('errors.manageDenied')}</p>
        </DashboardPanel>
      </div>
    )
  }

  if (fromId && sourceQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-center gap-2 py-24 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <div className="mb-5">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.7rem] tracking-tight text-ink sm:text-[1.95rem]">
            {fromId ? t('createFromTitle') : t('createTitle')}
          </h1>
          <p className="mt-2 text-sm text-body">{t('createSubtitle')}</p>
        </div>

        <TemplateForm
          key={fromId ?? 'new'}
          initialValues={initialValues}
          pending={createMutation.isPending || !tenantOrganizationId}
          error={error}
          submitLabel={t('form.submitReview')}
          secondaryLabel={t('form.saveDraft')}
          onCancel={() => router.push('/dashboard/templates')}
          onSubmit={(body) => {
            setError(null)
            createMutation.mutate(body)
          }}
        />
      </DashboardPanel>
    </div>
  )
}
