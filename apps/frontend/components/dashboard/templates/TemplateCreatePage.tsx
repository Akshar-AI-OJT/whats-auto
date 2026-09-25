'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type CreateWhatsappTemplateBody,
  type PlatformTemplateCatalogItem,
} from '@/lib/api'
import { unwrapSingle } from '@/lib/api-unwrap'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { useRouter } from '@/i18n/navigation'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { TemplateForm, type TemplateFormValues } from './TemplateForm'
import { queryKeys } from '@/lib/query-keys'
import { normalizeButtons, normalizeSampleValues, unwrapTemplate } from './template-utils'

function subscribeToLocation(onStoreChange: () => void) {
  window.addEventListener('popstate', onStoreChange)
  return () => window.removeEventListener('popstate', onStoreChange)
}

/** Primitive snapshot — useSyncExternalStore infinite-loops if getSnapshot returns a new object. */
function getCreateLocationSearch(): string {
  return window.location.search
}

function parseCreateQuery(search: string): { fromId: string | null; catalogId: string | null } {
  try {
    const sp = new URLSearchParams(search)
    return { fromId: sp.get('from'), catalogId: sp.get('catalog') }
  } catch {
    return { fromId: null, catalogId: null }
  }
}

function catalogToFormValues(item: PlatformTemplateCatalogItem): Partial<TemplateFormValues> {
  const headerTypeRaw = String(item.headerType || 'NONE').toUpperCase()
  const headerType = (
    ['NONE', 'TEXT', 'IMAGE', 'DOCUMENT'].includes(headerTypeRaw) ? headerTypeRaw : 'NONE'
  ) as TemplateFormValues['headerType']

  return {
    name: String(item.name || '')
      .toLowerCase()
      .replace(/\s+/g, '_'),
    category: (String(item.category).toUpperCase() as TemplateFormValues['category']) || 'UTILITY',
    language: item.language || 'en_US',
    headerType,
    headerContent: headerType === 'TEXT' ? item.headerContent || '' : '',
    headerMediaAssetId: '',
    headerMediaUrl: '',
    bodyText: item.bodyText || '',
    footerText: item.footerText || '',
    buttons: normalizeButtons(item.buttons),
    sampleValues: normalizeSampleValues(item.sampleValues),
  }
}

export function TemplateCreatePage() {
  const t = useTranslations('dashboard.templates')
  const router = useRouter()
  const queryClient = useQueryClient()
  const { tenantOrganizationId, canCreateTemplates, isLoading: orgsLoading } = useOrganizations()
  const search = useSyncExternalStore(subscribeToLocation, getCreateLocationSearch, () => '')
  const { fromId, catalogId } = useMemo(() => parseCreateQuery(search), [search])
  const [error, setError] = useState<string | null>(null)

  const sourceQuery = useQuery({
    queryKey: queryKeys.templates.detail(fromId ?? 'none'),
    enabled: Boolean(fromId) && canCreateTemplates,
    queryFn: async () => {
      const { data } = await api.whatsapp.getTemplate(fromId!)
      return unwrapTemplate(data)
    },
  })

  const catalogQuery = useQuery({
    queryKey: queryKeys.templates.catalogDetail(catalogId ?? 'none'),
    enabled: Boolean(catalogId) && !fromId && canCreateTemplates,
    queryFn: async () => {
      const { data } = await api.templateCatalog.get(catalogId!)
      return unwrapSingle<PlatformTemplateCatalogItem>(data)
    },
  })

  const initialValues = useMemo<Partial<TemplateFormValues> | undefined>(() => {
    if (fromId && sourceQuery.data) {
      const template = sourceQuery.data
      const headerTypeRaw = String(template.headerType || 'NONE').toUpperCase()
      const headerType = (
        ['NONE', 'TEXT', 'IMAGE', 'DOCUMENT'].includes(headerTypeRaw) ? headerTypeRaw : 'NONE'
      ) as TemplateFormValues['headerType']

      return {
        name: '',
        category:
          (String(template.category).toUpperCase() as TemplateFormValues['category']) || 'UTILITY',
        language: template.language || 'en_US',
        headerType,
        headerContent: headerType === 'TEXT' ? template.headerContent || '' : '',
        headerMediaAssetId: '',
        headerMediaUrl:
          headerType === 'IMAGE' || headerType === 'DOCUMENT' ? template.headerMediaUrl || '' : '',
        bodyText: template.bodyText || '',
        footerText: template.footerText || '',
        buttons: normalizeButtons(template.buttons),
        sampleValues: normalizeSampleValues(template.sampleValues),
      }
    }

    if (catalogId && catalogQuery.data) {
      return catalogToFormValues(catalogQuery.data)
    }

    return undefined
  }, [catalogId, catalogQuery.data, fromId, sourceQuery.data])

  const createMutation = useMutation({
    mutationFn: async (body: CreateWhatsappTemplateBody) => {
      const { data } = await api.whatsapp.createTemplate(body)
      return unwrapTemplate(data)
    },
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.templates.all })
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

  if (!orgsLoading && !canCreateTemplates) {
    return (
      <div className="w-full min-w-0">
        <DashboardPanel className="px-4 py-5 sm:px-6">
          <p className="text-sm text-negative">{t('errors.manageDenied')}</p>
        </DashboardPanel>
      </div>
    )
  }

  const sourceLoading =
    Boolean(fromId) && (sourceQuery.isLoading || sourceQuery.isFetching || !sourceQuery.isFetched)
  const catalogLoading =
    Boolean(catalogId) &&
    !fromId &&
    (catalogQuery.isLoading || catalogQuery.isFetching || !catalogQuery.isFetched)

  if (sourceLoading || catalogLoading) {
    return (
      <div className="flex w-full min-w-0 items-center justify-center gap-2 py-24 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  if (fromId && (sourceQuery.isError || !sourceQuery.data)) {
    return (
      <div className="w-full min-w-0">
        <DashboardPanel className="px-4 py-5 sm:px-6">
          <p className="text-sm text-negative">
            {(sourceQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
          </p>
        </DashboardPanel>
      </div>
    )
  }

  if (catalogId && !fromId && (catalogQuery.isError || !catalogQuery.data)) {
    return (
      <div className="w-full min-w-0">
        <DashboardPanel className="px-4 py-5 sm:px-6">
          <p className="text-sm text-negative">
            {(catalogQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
          </p>
        </DashboardPanel>
      </div>
    )
  }

  const formKey = fromId ? `from-${fromId}` : catalogId ? `catalog-${catalogId}` : 'new'

  const title = fromId
    ? t('createFromTitle')
    : catalogId
      ? t('createFromCatalogTitle')
      : t('createTitle')
  const subtitle = fromId
    ? t('createFromSubtitle')
    : catalogId
      ? t('createFromCatalogSubtitle')
      : t('createSubtitle')

  return (
    <div className="w-full min-w-0">
      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <div className="mb-5">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.7rem] tracking-tight text-ink sm:text-[1.95rem]">
            {title}
          </h1>
          <p className="mt-2 text-sm text-body">{subtitle}</p>
        </div>

        <TemplateForm
          key={formKey}
          initialValues={initialValues}
          pending={createMutation.isPending || !tenantOrganizationId}
          error={error}
          submitLabel={t('form.create')}
          onCancel={() =>
            router.push(catalogId ? '/dashboard/templates/browse' : '/dashboard/templates')
          }
          onSubmit={(body) => {
            setError(null)
            const catalog = catalogQuery.data
            createMutation.mutate({
              ...body,
              ...(catalogId
                ? {
                    catalogTemplateId: catalogId,
                    ...(catalog?.libraryTemplateName
                      ? { libraryTemplateName: catalog.libraryTemplateName }
                      : {}),
                  }
                : {}),
            })
          }}
        />
      </DashboardPanel>
    </div>
  )
}
