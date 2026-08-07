'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { api, type ApiError, type CreateCampaignBody, type UpdateCampaignBody } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { campaignQueryKeys } from './CampaignsListPage'
import { unwrapCampaign, isEditableCampaignStatus } from './campaign-utils'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'

/** Avoid useSearchParams — it can stall the create page on hard refresh via Suspense. */
function readDuplicateFromId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search).get('from')
  } catch {
    return null
  }
}

type CampaignFormPageProps = {
  mode: 'create' | 'edit'
  campaignId?: string
}

type FormState = {
  name: string
  messageTemplateId: string
  audienceLabel: string
  scheduleMode: 'now' | 'later'
  scheduledAt: string
}

const emptyForm: FormState = {
  name: '',
  messageTemplateId: '',
  audienceLabel: '',
  scheduleMode: 'now',
  scheduledAt: '',
}

export function CampaignFormPage({ mode, campaignId }: CampaignFormPageProps) {
  const t = useTranslations('dashboard.campaigns')
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    tenantOrganizationId,
    canCreateCampaigns,
    canEditCampaigns,
    canViewContacts,
    isLoading: orgsLoading,
  } = useOrganizations()

  const [fromId, setFromId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({})

  useEffect(() => {
    if (mode !== 'create') {
      setFromId(null)
      return
    }
    setFromId(readDuplicateFromId())
  }, [mode])

  const canSubmit = mode === 'create' ? canCreateCampaigns : canEditCampaigns

  const sourceQuery = useQuery({
    queryKey: campaignQueryKeys.detail(campaignId || fromId || 'none'),
    enabled:
      Boolean(tenantOrganizationId) &&
      Boolean(campaignId || fromId) &&
      !orgsLoading &&
      canSubmit,
    queryFn: async () => {
      const id = campaignId || fromId
      if (!id) return null
      const { data } = await api.campaigns.get(id)
      return unwrapCampaign(data)
    },
  })

  const templatesQuery = useQuery({
    queryKey: [...campaignQueryKeys.all, 'form-templates', tenantOrganizationId],
    enabled: Boolean(tenantOrganizationId) && canSubmit && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.whatsapp.listTemplates({
        perPage: 100,
        status: 'approved',
      })
      return unwrapTemplateList(data).items
    },
  })

  const contactsQuery = useQuery({
    queryKey: [...campaignQueryKeys.all, 'form-contacts', tenantOrganizationId],
    enabled: Boolean(tenantOrganizationId) && canViewContacts && canSubmit && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.contacts.list()
      if (Array.isArray(data)) return data
      const wrapped = data as { data?: typeof data }
      return Array.isArray(wrapped.data) ? wrapped.data : []
    },
  })

  useEffect(() => {
    const source = sourceQuery.data
    if (!source) return
    setForm({
      name: mode === 'create' && fromId ? `${source.name} (copy)` : source.name,
      messageTemplateId: source.messageTemplateId ?? '',
      audienceLabel: '',
      scheduleMode: source.scheduledAt ? 'later' : 'now',
      scheduledAt: source.scheduledAt
        ? new Date(source.scheduledAt).toISOString().slice(0, 16)
        : '',
    })
  }, [sourceQuery.data, mode, fromId])

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((item) => item.id === form.messageTemplateId) ?? null,
    [templatesQuery.data, form.messageTemplateId]
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const bodyBase = {
        name: form.name.trim(),
        ...(form.messageTemplateId ? { messageTemplateId: form.messageTemplateId } : {}),
      }

      if (mode === 'edit' && campaignId) {
        const body: UpdateCampaignBody = {
          ...bodyBase,
          status: form.scheduleMode === 'later' ? 'scheduled' : 'draft',
          scheduledAt:
            form.scheduleMode === 'later' && form.scheduledAt
              ? new Date(form.scheduledAt).toISOString()
              : null,
        }
        const { data } = await api.campaigns.update(campaignId, body)
        return unwrapCampaign(data)
      }

      const body: CreateCampaignBody = {
        ...bodyBase,
        status: form.scheduleMode === 'later' ? 'scheduled' : 'draft',
        ...(form.scheduleMode === 'later' && form.scheduledAt
          ? { scheduledAt: new Date(form.scheduledAt).toISOString() }
          : {}),
      }
      const { data } = await api.campaigns.create(body)
      return unwrapCampaign(data)
    },
    onSuccess: async (campaign) => {
      await queryClient.invalidateQueries({ queryKey: campaignQueryKeys.all })
      if (campaign?.id) {
        router.push(`/dashboard/campaigns/${campaign.id}`)
      } else {
        router.push('/dashboard/campaigns')
      }
    },
    onError: (err) => {
      setError((err as unknown as ApiError).message || t('errors.saveFailed'))
    },
  })

  function validate() {
    const next: { name?: string } = {}
    if (!form.name.trim()) next.name = t('form.errors.nameRequired')
    if (form.name.trim().length > 100) next.name = t('form.errors.nameTooLong')
    if (form.scheduleMode === 'later' && !form.scheduledAt) {
      setError(t('form.errors.scheduledAtRequired'))
      return false
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!validate()) return
    mutation.mutate()
  }

  if (!orgsLoading && !canSubmit) {
    return (
      <DashboardPanel as="section" className="mx-auto max-w-[1200px] px-4 py-6">
        <p role="alert" className="text-sm text-negative">
          {t('errors.permissionDenied')}
        </p>
      </DashboardPanel>
    )
  }

  if ((campaignId || fromId) && sourceQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  if (mode === 'edit' && sourceQuery.data && !isEditableCampaignStatus(sourceQuery.data.status)) {
    return (
      <DashboardPanel as="section" className="mx-auto max-w-[1200px] px-4 py-6">
        <p role="alert" className="text-sm text-negative">
          {t('errors.notEditable')}
        </p>
        <Link
          href={`/dashboard/campaigns/${campaignId}`}
          className="mt-4 inline-flex text-sm font-medium text-ink underline"
        >
          {t('backToDetails')}
        </Link>
      </DashboardPanel>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
      <div>
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-2 text-sm font-medium text-body hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('backToList')}
        </Link>
        <h1 className="mt-3 font-display text-2xl tracking-tight text-ink sm:text-3xl">
          {mode === 'edit' ? t('editTitle') : t('createTitle')}
        </h1>
        <p className="mt-1 text-sm text-body">{t('formSubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <DashboardPanel as="section" className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2">
            <label htmlFor="campaign-name" className="text-sm font-medium text-ink">
              {t('form.name')}
            </label>
            <Input
              id="campaign-name"
              value={form.name}
              maxLength={100}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('form.namePlaceholder')}
            />
            <div className="flex justify-between text-xs text-mute">
              <span>{fieldErrors.name ? <span className="text-negative">{fieldErrors.name}</span> : null}</span>
              <span>
                {form.name.length}/100
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="campaign-type" className="text-sm font-medium text-ink">
              {t('form.type')}
            </label>
            <select
              id="campaign-type"
              disabled
              className="h-11 w-full rounded-md border border-dash-border bg-dash-surface px-3 text-sm text-ink"
              value="broadcast"
            >
              <option value="broadcast">{t('type.broadcast')}</option>
            </select>
            <p className="text-xs text-mute">{t('form.typeHint')}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="campaign-template" className="text-sm font-medium text-ink">
              {t('form.template')}
            </label>
            <select
              id="campaign-template"
              className="h-11 w-full rounded-md border border-dash-border bg-canvas px-3 text-sm text-ink"
              value={form.messageTemplateId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, messageTemplateId: e.target.value }))
              }
            >
              <option value="">{t('form.templatePlaceholder')}</option>
              {(templatesQuery.data ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="campaign-audience" className="text-sm font-medium text-ink">
              {t('form.audience')}
            </label>
            <select
              id="campaign-audience"
              className="h-11 w-full rounded-md border border-dash-border bg-canvas px-3 text-sm text-ink"
              value={form.audienceLabel}
              onChange={(e) => setForm((prev) => ({ ...prev, audienceLabel: e.target.value }))}
            >
              <option value="">{t('form.audiencePlaceholder')}</option>
              <option value="all-contacts">
                {t('form.audienceAll', { count: contactsQuery.data?.length ?? 0 })}
              </option>
            </select>
            <p className="text-xs text-mute">{t('form.audienceHint')}</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ink">{t('form.schedule')}</legend>
            <label className="flex items-center gap-2 text-sm text-body">
              <input
                type="radio"
                name="schedule"
                checked={form.scheduleMode === 'now'}
                onChange={() => setForm((prev) => ({ ...prev, scheduleMode: 'now' }))}
              />
              {t('form.sendNow')}
            </label>
            <label className="flex items-center gap-2 text-sm text-body">
              <input
                type="radio"
                name="schedule"
                checked={form.scheduleMode === 'later'}
                onChange={() => setForm((prev) => ({ ...prev, scheduleMode: 'later' }))}
              />
              {t('form.scheduleLater')}
            </label>
            {form.scheduleMode === 'later' ? (
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                className="max-w-xs"
              />
            ) : null}
            <p className="text-xs text-mute">{t('form.scheduleHint')}</p>
          </fieldset>

          {error ? (
            <p role="alert" className="rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative">
              {error}
            </p>
          ) : null}
        </DashboardPanel>

        <div className="space-y-4">
          <DashboardPanel as="section" className="p-5 sm:p-6">
            <h2 className="font-display text-lg text-ink">{t('summary.title')}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3 border-b border-dash-border pb-2">
                <dt className="text-mute">{t('summary.name')}</dt>
                <dd className="text-right font-medium text-ink">{form.name || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-dash-border pb-2">
                <dt className="text-mute">{t('summary.type')}</dt>
                <dd className="text-right font-medium text-ink">{t('type.broadcast')}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-dash-border pb-2">
                <dt className="text-mute">{t('summary.template')}</dt>
                <dd className="text-right font-medium text-ink">
                  {selectedTemplate?.name || '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-dash-border pb-2">
                <dt className="text-mute">{t('summary.audience')}</dt>
                <dd className="text-right font-medium text-ink">
                  {form.audienceLabel
                    ? t('form.audienceAll', { count: contactsQuery.data?.length ?? 0 })
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">{t('summary.schedule')}</dt>
                <dd className="text-right font-medium text-ink">
                  {form.scheduleMode === 'later'
                    ? form.scheduledAt || t('form.scheduleLater')
                    : t('form.sendNow')}
                </dd>
              </div>
            </dl>
          </DashboardPanel>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/dashboard/campaigns')}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {mutation.isPending ? t('form.saving') : t('form.reviewConfirm')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
