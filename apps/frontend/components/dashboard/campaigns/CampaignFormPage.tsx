'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type Campaign,
  type ContactSummary,
  type CreateCampaignBody,
  type UpdateCampaignBody,
} from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { campaignQueryKeys } from './CampaignsListPage'
import { unwrapCampaign, isEditableCampaignStatus } from './campaign-utils'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'
import { datetimeLocalToVineDate } from '@/lib/vine-date'
import { CampaignRecipientList } from './CampaignRecipientList'

/** Avoid useSearchParams — it can stall the create page on hard refresh via Suspense. */
function readDuplicateFromId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search).get('from')
  } catch {
    return null
  }
}

function unwrapContacts(data: unknown): ContactSummary[] {
  if (Array.isArray(data)) return data as ContactSummary[]
  const wrapped = data as { data?: ContactSummary[] }
  return Array.isArray(wrapped.data) ? wrapped.data : []
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
    canLaunchCampaigns,
    canViewContacts,
    isLoading: orgsLoading,
  } = useOrganizations()

  const [fromId] = useState(() => (mode === 'create' ? readDuplicateFromId() : null))
  const [form, setForm] = useState<FormState>(emptyForm)
  const [excludedContactIds, setExcludedContactIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    template?: string
    audience?: string
  }>({})

  const canSubmit = mode === 'create' ? canCreateCampaigns : canEditCampaigns

  const sourceQuery = useQuery({
    queryKey: campaignQueryKeys.detail(campaignId || fromId || 'none'),
    enabled:
      Boolean(tenantOrganizationId) && Boolean(campaignId || fromId) && !orgsLoading && canSubmit,
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
      return unwrapContacts(data)
    },
  })

  // Hydrate form when source campaign loads (render-time — avoids setState-in-effect).
  const source = sourceQuery.data
  const sourceKey = source
    ? `${mode}:${fromId ?? ''}:${campaignId ?? ''}:${source.id}:${source.updatedAt ?? source.createdAt ?? ''}`
    : null
  const [hydratedSourceKey, setHydratedSourceKey] = useState<string | null>(null)
  if (source && sourceKey && sourceKey !== hydratedSourceKey) {
    setHydratedSourceKey(sourceKey)
    setForm({
      name: mode === 'create' && fromId ? `${source.name} (copy)` : source.name,
      messageTemplateId: source.messageTemplateId ?? '',
      audienceLabel: source.totalRecipients > 0 ? 'all-contacts' : '',
      scheduleMode: source.scheduledAt ? 'later' : 'now',
      scheduledAt: source.scheduledAt
        ? new Date(source.scheduledAt).toISOString().slice(0, 16)
        : '',
    })
  }

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((item) => item.id === form.messageTemplateId) ?? null,
    [templatesQuery.data, form.messageTemplateId]
  )

  const allContacts = contactsQuery.data
  const selectedContacts = useMemo(() => {
    if (form.audienceLabel !== 'all-contacts') return []
    const list = allContacts ?? []
    if (excludedContactIds.length === 0) return list
    const excluded = new Set(excludedContactIds)
    return list.filter((contact) => !excluded.has(contact.id))
  }, [form.audienceLabel, allContacts, excludedContactIds])
  const contactIds = useMemo(
    () => selectedContacts.map((contact) => contact.id),
    [selectedContacts]
  )
  const isAllContactsSelection =
    form.audienceLabel === 'all-contacts' &&
    excludedContactIds.length === 0 &&
    selectedContacts.length > 0

  function handleAudienceChange(value: string) {
    setForm((prev) => ({ ...prev, audienceLabel: value }))
    setExcludedContactIds([])
  }

  function handleRemoveRecipient(contactId: string) {
    setExcludedContactIds((prev) => (prev.includes(contactId) ? prev : [...prev, contactId]))
  }

  const mutation = useMutation({
    mutationFn: async (): Promise<Campaign | null> => {
      const whatsappConfigId = selectedTemplate?.whatsappConfigId ?? undefined
      const bodyBase = {
        name: form.name.trim(),
        ...(form.messageTemplateId ? { messageTemplateId: form.messageTemplateId } : {}),
        ...(whatsappConfigId ? { whatsappConfigId } : {}),
      }

      // Always persist as draft first; schedule/send APIs own lifecycle transitions.
      let campaign: Campaign | null = null
      if (mode === 'edit' && campaignId) {
        const body: UpdateCampaignBody = {
          ...bodyBase,
          status: 'draft',
          scheduledAt: null,
        }
        const { data } = await api.campaigns.update(campaignId, body)
        campaign = unwrapCampaign(data)
      } else {
        const body: CreateCampaignBody = {
          ...bodyBase,
          status: 'draft',
        }
        const { data } = await api.campaigns.create(body)
        campaign = unwrapCampaign(data)
      }

      if (!campaign?.id) {
        throw new Error(t('errors.saveFailed'))
      }

      if (form.audienceLabel === 'all-contacts') {
        if (contactIds.length === 0) {
          throw new Error(t('form.errors.audienceEmpty'))
        }
        const { data } = await api.campaigns.replaceRecipients(campaign.id, {
          contactIds,
        })
        campaign = unwrapCampaign(data) ?? campaign
      }

      if (form.scheduleMode === 'later') {
        // Vine vine.date() rejects ISO-8601 with T/Z — send YYYY-MM-DD HH:mm:ss.
        const scheduledAt = datetimeLocalToVineDate(form.scheduledAt)
        const { data } = await api.campaigns.schedule(campaign.id, { scheduledAt })
        campaign = unwrapCampaign(data) ?? campaign
      } else if (canLaunchCampaigns && form.audienceLabel === 'all-contacts') {
        const { data } = await api.campaigns.send(campaign.id)
        campaign = unwrapCampaign(data) ?? campaign
      }

      return campaign
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
    const next: { name?: string; template?: string; audience?: string } = {}
    if (!form.name.trim()) next.name = t('form.errors.nameRequired')
    if (form.name.trim().length > 200) next.name = t('form.errors.nameTooLong')
    if (!form.messageTemplateId) next.template = t('form.errors.templateRequired')
    if (!form.audienceLabel) next.audience = t('form.errors.audienceRequired')
    if (form.audienceLabel === 'all-contacts') {
      if (contactsQuery.isError) {
        next.audience = t('form.recipients.loadFailed')
      } else if (contactIds.length === 0) {
        next.audience = t('form.errors.audienceEmpty')
      }
    }
    if (form.scheduleMode === 'later') {
      if (!form.scheduledAt) {
        setError(t('form.errors.scheduledAtRequired'))
        setFieldErrors(next)
        return false
      }
      if (new Date(form.scheduledAt).getTime() <= Date.now()) {
        setError(t('form.errors.scheduledAtFuture'))
        setFieldErrors(next)
        return false
      }
    }
    setFieldErrors(next)
    setError(null)
    return Object.keys(next).length === 0
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return
    mutation.mutate()
  }

  if (!orgsLoading && !canSubmit) {
    return (
      <DashboardPanel as="section" className="w-full min-w-0 px-4 py-6">
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
      <DashboardPanel as="section" className="w-full min-w-0 px-4 py-6">
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

  const submitLabel =
    form.scheduleMode === 'later'
      ? t('form.confirmSchedule')
      : canLaunchCampaigns
        ? t('form.confirmSend')
        : t('form.reviewConfirm')

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
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

      <form
        onSubmit={handleSubmit}
        className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]"
      >
        <DashboardPanel as="section" className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2">
            <label htmlFor="campaign-name" className="text-sm font-medium text-ink">
              {t('form.name')}
            </label>
            <Input
              id="campaign-name"
              value={form.name}
              maxLength={200}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('form.namePlaceholder')}
            />
            <div className="flex justify-between text-xs text-mute">
              <span>
                {fieldErrors.name ? (
                  <span className="text-negative">{fieldErrors.name}</span>
                ) : null}
              </span>
              <span>{form.name.length}/200</span>
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
              onChange={(e) => setForm((prev) => ({ ...prev, messageTemplateId: e.target.value }))}
            >
              <option value="">{t('form.templatePlaceholder')}</option>
              {(templatesQuery.data ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {fieldErrors.template ? (
              <p className="text-xs text-negative">{fieldErrors.template}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="campaign-audience" className="text-sm font-medium text-ink">
              {t('form.audience')}
            </label>
            <select
              id="campaign-audience"
              className="h-11 w-full rounded-md border border-dash-border bg-canvas px-3 text-sm text-ink"
              value={form.audienceLabel}
              onChange={(e) => handleAudienceChange(e.target.value)}
              disabled={contactsQuery.isLoading}
            >
              <option value="">{t('form.audiencePlaceholder')}</option>
              <option value="all-contacts">
                {t('form.audienceAll', { count: allContacts?.length ?? 0 })}
              </option>
            </select>
            <p className="text-xs text-mute">{t('form.audienceHint')}</p>
            {fieldErrors.audience ? (
              <p className="text-xs text-negative">{fieldErrors.audience}</p>
            ) : null}
            <CampaignRecipientList
              audienceSelected={form.audienceLabel === 'all-contacts'}
              contacts={selectedContacts}
              selectedCount={selectedContacts.length}
              isAllContacts={isAllContactsSelection}
              loading={contactsQuery.isLoading || (contactsQuery.isFetching && !allContacts)}
              error={
                contactsQuery.isError
                  ? (contactsQuery.error as unknown as ApiError | undefined)?.message ||
                    t('form.recipients.loadFailed')
                  : null
              }
              onRetry={() => {
                void contactsQuery.refetch()
              }}
              onRemove={handleRemoveRecipient}
            />
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
            <p
              role="alert"
              className="rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative"
            >
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
                <dd className="text-right font-medium text-ink">{selectedTemplate?.name || '—'}</dd>
              </div>
              <div className="space-y-3 border-b border-dash-border pb-3">
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('summary.audience')}</dt>
                  <dd className="text-right font-medium text-ink">
                    {form.audienceLabel !== 'all-contacts'
                      ? '—'
                      : contactsQuery.isError
                        ? t('form.recipients.loadFailed')
                        : contactsQuery.isLoading && !allContacts
                          ? t('form.recipients.loading')
                          : isAllContactsSelection
                            ? t('form.recipients.allCount', { count: selectedContacts.length })
                            : t('form.recipients.selectedCount', { count: selectedContacts.length })}
                  </dd>
                </div>
                <CampaignRecipientList
                  compact
                  showCount={false}
                  audienceSelected={form.audienceLabel === 'all-contacts'}
                  contacts={selectedContacts}
                  selectedCount={selectedContacts.length}
                  isAllContacts={isAllContactsSelection}
                  loading={contactsQuery.isLoading || (contactsQuery.isFetching && !allContacts)}
                  error={
                    contactsQuery.isError
                      ? (contactsQuery.error as unknown as ApiError | undefined)?.message ||
                        t('form.recipients.loadFailed')
                      : null
                  }
                  onRetry={() => {
                    void contactsQuery.refetch()
                  }}
                  onRemove={handleRemoveRecipient}
                />
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
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/campaigns')}
            >
              {t('form.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                (form.audienceLabel === 'all-contacts' &&
                  (contactsQuery.isLoading ||
                    contactsQuery.isError ||
                    contactIds.length === 0))
              }
              className="gap-2"
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {mutation.isPending ? t('form.saving') : submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
