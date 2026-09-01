'use client'

import { useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { PLAN_FEATURE_CATALOG } from './plan-feature-catalog'
import { createPlan, getPlan, updatePlan } from './plan-service'
import type {
  CreatePlanInput,
  PlanBillingPeriod,
  PlanFeature,
  PlanFeatureCategoryId,
  PlanLimits,
  PlanStatus,
  SubscriptionPlan,
} from './types'
import { DEFAULT_PLAN_LIMITS } from './types'

const selectClassName = cn(
  'h-11 w-full min-w-0 cursor-pointer rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

type Step = 1 | 2

type LimitFieldKey = keyof PlanLimits

type PlanFormState = {
  name: string
  description: string
  customPricing: boolean
  price: string
  currency: 'INR' | 'USD'
  billingPeriod: Exclude<PlanBillingPeriod, 'custom'> | 'custom'
  trialDays: string
  status: Exclude<PlanStatus, 'archived'>
  limits: Record<LimitFieldKey, string>
  features: Record<string, { enabled: boolean; description: string }>
}

const CATEGORIES: PlanFeatureCategoryId[] = [
  'messaging',
  'automation',
  'ai',
  'team',
  'integrations',
]

const LIMIT_FIELD_GROUPS: Array<{ title: string; fields: LimitFieldKey[] }> = [
  {
    title: 'Team & messaging',
    fields: ['users', 'whatsappNumbers', 'maxContacts', 'messagesPerMonth'],
  },
  {
    title: 'Campaigns & storage',
    fields: [
      'campaignsPerMonth',
      'maxBroadcastRecipients',
      'maxCampaignRecipientListSize',
      'storageBytes',
      'maxFileUploadMb',
    ],
  },
  {
    title: 'Automation & AI',
    fields: [
      'maxActiveFlows',
      'maxKnowledgeDocs',
      'maxKnowledgeDocSizeMb',
      'aiRepliesPerMonth',
      'aiGenerationsPerConversationHour',
    ],
  },
  {
    title: 'Integrations & retention',
    fields: [
      'maxStoreConnections',
      'maxApiKeys',
      'maxTemplates',
      'analyticsRetentionDays',
      'auditLogRetentionDays',
      'conversationInboxRetentionDays',
      'dispatchRatePerSec',
    ],
  },
]

const ANTI_ABUSE_FIELDS = new Set<LimitFieldKey>([
  'maxFileUploadMb',
  'aiGenerationsPerConversationHour',
  'dispatchRatePerSec',
])

function emptyFeatureMap(): PlanFormState['features'] {
  return Object.fromEntries(
    PLAN_FEATURE_CATALOG.map((item) => [item.key, { enabled: false, description: '' }])
  )
}

function limitsToForm(limits: PlanLimits): Record<LimitFieldKey, string> {
  const out = {} as Record<LimitFieldKey, string>
  for (const key of Object.keys(DEFAULT_PLAN_LIMITS) as LimitFieldKey[]) {
    const value = limits[key]
    out[key] = value === null || value === undefined ? '' : String(value)
  }
  return out
}

function emptyForm(): PlanFormState {
  return {
    name: '',
    description: '',
    customPricing: false,
    price: '',
    currency: 'INR',
    billingPeriod: 'monthly',
    trialDays: '',
    status: 'draft',
    limits: limitsToForm(DEFAULT_PLAN_LIMITS),
    features: emptyFeatureMap(),
  }
}

function formFromPlan(plan: SubscriptionPlan): PlanFormState {
  const features = emptyFeatureMap()
  for (const feature of plan.features) {
    features[feature.key] = {
      enabled: feature.enabled,
      description: feature.description ?? '',
    }
  }
  return {
    name: plan.name,
    description: plan.description,
    customPricing: plan.price == null || plan.billingPeriod === 'custom',
    price: plan.price != null ? String(plan.price) : '',
    currency: plan.currency,
    billingPeriod:
      plan.billingPeriod === 'yearly'
        ? 'yearly'
        : plan.billingPeriod === 'custom'
          ? 'custom'
          : 'monthly',
    trialDays: plan.trialDays != null ? String(plan.trialDays) : '',
    status: plan.status === 'archived' ? 'draft' : plan.status,
    limits: limitsToForm({ ...DEFAULT_PLAN_LIMITS, ...plan.limits }),
    features,
  }
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function parseRequiredNumber(value: string, fallback: number): number {
  const n = parseOptionalNumber(value)
  return n !== null && n >= 1 ? n : fallback
}

function toCreateInput(form: PlanFormState): CreatePlanInput {
  const custom = form.customPricing
  const features: PlanFeature[] = PLAN_FEATURE_CATALOG.map((item) => ({
    key: item.key,
    name: item.key,
    enabled: Boolean(form.features[item.key]?.enabled),
    description: form.features[item.key]?.description.trim() || undefined,
    category: item.category,
  }))

  const users = parseOptionalNumber(form.limits.users)
  const limits: PlanLimits = {
    users,
    seats: parseOptionalNumber(form.limits.seats) ?? users,
    whatsappNumbers: parseOptionalNumber(form.limits.whatsappNumbers),
    maxContacts: parseOptionalNumber(form.limits.maxContacts),
    messagesPerMonth: parseOptionalNumber(form.limits.messagesPerMonth),
    campaignsPerMonth: parseOptionalNumber(form.limits.campaignsPerMonth),
    maxBroadcastRecipients: parseOptionalNumber(form.limits.maxBroadcastRecipients),
    storageBytes: parseOptionalNumber(form.limits.storageBytes),
    maxFileUploadMb: parseRequiredNumber(
      form.limits.maxFileUploadMb,
      DEFAULT_PLAN_LIMITS.maxFileUploadMb
    ),
    maxActiveFlows: parseOptionalNumber(form.limits.maxActiveFlows),
    maxKnowledgeDocs: parseOptionalNumber(form.limits.maxKnowledgeDocs),
    maxKnowledgeDocSizeMb: parseOptionalNumber(form.limits.maxKnowledgeDocSizeMb),
    aiRepliesPerMonth: parseOptionalNumber(form.limits.aiRepliesPerMonth),
    maxStoreConnections: parseOptionalNumber(form.limits.maxStoreConnections),
    maxApiKeys: parseOptionalNumber(form.limits.maxApiKeys),
    maxWebhookEndpoints: parseOptionalNumber(form.limits.maxWebhookEndpoints),
    analyticsRetentionDays: parseOptionalNumber(form.limits.analyticsRetentionDays),
    auditLogRetentionDays: parseOptionalNumber(form.limits.auditLogRetentionDays),
    maxTemplates: parseOptionalNumber(form.limits.maxTemplates),
    maxCampaignRecipientListSize: parseOptionalNumber(form.limits.maxCampaignRecipientListSize),
    conversationInboxRetentionDays: parseOptionalNumber(form.limits.conversationInboxRetentionDays),
    aiGenerationsPerConversationHour: parseRequiredNumber(
      form.limits.aiGenerationsPerConversationHour,
      DEFAULT_PLAN_LIMITS.aiGenerationsPerConversationHour
    ),
    dispatchRatePerSec: parseRequiredNumber(
      form.limits.dispatchRatePerSec,
      DEFAULT_PLAN_LIMITS.dispatchRatePerSec
    ),
  }

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    price: custom ? null : Number(form.price),
    currency: form.currency,
    billingPeriod: custom ? 'custom' : form.billingPeriod === 'yearly' ? 'yearly' : 'monthly',
    status: form.status,
    trialDays: parseOptionalNumber(form.trialDays),
    limits,
    features,
  }
}

type PlanFormPageProps = {
  mode: 'create' | 'edit'
  planId?: string
}

export function PlanFormPage({ mode, planId }: PlanFormPageProps) {
  const t = useTranslations('admin.plans')
  const router = useRouter()
  const queryClient = useQueryClient()
  const nameId = useId()
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<PlanFormState>(emptyForm)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const planQuery = useQuery({
    queryKey: queryKeys.admin.planDetail(planId),
    queryFn: async () => {
      const plan = await getPlan(planId!)
      if (!plan) throw new Error('not_found')
      return plan
    },
    enabled: mode === 'edit' && Boolean(planId),
    staleTime: 60_000,
  })

  // Reset when switching edit targets.
  const [trackedPlanId, setTrackedPlanId] = useState(planId)
  const [appliedPlanId, setAppliedPlanId] = useState<string | null>(null)
  if (planId !== trackedPlanId) {
    setTrackedPlanId(planId)
    setAppliedPlanId(null)
    setForm(emptyForm())
    setStep(1)
    setError(null)
  }

  // Hydrate form when edit plan loads.
  const hydratedPlanId = planQuery.data?.id
  if (mode === 'edit' && hydratedPlanId && hydratedPlanId !== appliedPlanId && planQuery.data) {
    setAppliedPlanId(hydratedPlanId)
    setForm(formFromPlan(planQuery.data))
  }

  const loading = mode === 'edit' && planQuery.isLoading
  const loadError =
    mode === 'edit' && planQuery.isError
      ? planQuery.error instanceof Error && planQuery.error.message === 'not_found'
        ? t('errors.notFound')
        : t('errors.loadFailed')
      : null

  const selectedCount = useMemo(
    () => Object.values(form.features).filter((item) => item.enabled).length,
    [form.features]
  )

  function validateStep1(): string | null {
    if (!form.name.trim()) return t('errors.nameRequired')
    if (!form.customPricing) {
      const price = Number(form.price)
      if (!Number.isFinite(price) || price < 0) return t('errors.priceRequired')
    }
    for (const key of Object.keys(form.limits) as LimitFieldKey[]) {
      const raw = form.limits[key].trim()
      if (!raw) {
        if (ANTI_ABUSE_FIELDS.has(key)) return t('errors.limitInvalid')
        continue
      }
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) return t('errors.limitInvalid')
      if (ANTI_ABUSE_FIELDS.has(key) && n < 1) return t('errors.limitInvalid')
    }
    const trial = form.trialDays.trim()
    if (trial && (!Number.isFinite(Number(trial)) || Number(trial) < 0)) return t('errors.trialInvalid')
    return null
  }

  function goNext() {
    const validation = validateStep1()
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    setStep(2)
  }

  async function handleSubmit() {
    const validation = validateStep1()
    if (validation) {
      setError(validation)
      setStep(1)
      return
    }
    setPending(true)
    setError(null)
    try {
      const payload = toCreateInput(form)
      if (mode === 'edit' && planId) {
        const result = await updatePlan(planId, payload)
        if (!result.ok) {
          setError(t(result.messageKey))
          return
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.admin.plansRoot })
        router.push('/admin/plans?updated=1')
        return
      }
      await createPlan(payload)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.plansRoot })
      router.push('/admin/plans?created=1')
    } catch {
      setError(mode === 'edit' ? t('errors.updateFailed') : t('errors.createFailed'))
    } finally {
      setPending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-mute">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/plans"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
        >
          <ArrowLeft className="size-4" />
          {t('backToPlans')}
        </Link>
        <p role="alert" className="text-sm text-negative">
          {loadError}
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <Link
          href="/admin/plans"
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
        >
          <ArrowLeft className="size-4" />
          {t('backToPlans')}
        </Link>
        <p className="text-xs font-semibold tracking-wide text-mute uppercase">{t('eyebrow')}</p>
        <h1 className="mt-1 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
          {mode === 'edit' ? t('editTitle') : t('createTitle')}
        </h1>
        <p className="mt-1 text-sm leading-6 text-body">
          {mode === 'edit' ? t('editSubtitle') : t('createSubtitle')}
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-3">
        {[
          { id: 1 as const, label: t('steps.details'), hint: t('steps.detailsHint') },
          { id: 2 as const, label: t('steps.features'), hint: t('steps.featuresHint') },
        ].map((item) => {
          const active = step === item.id
          const done = step > item.id
          return (
            <li
              key={item.id}
              className={cn(
                'rounded-2xl border px-4 py-3',
                active || done ? 'border-primary/40 bg-primary-pale/40' : 'border-dash-border bg-canvas'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold',
                    active || done ? 'bg-primary text-on-primary' : 'border border-dash-border text-mute'
                  )}
                >
                  {done ? <Check className="size-3.5" /> : item.id}
                </span>
                <span className={cn('text-sm font-semibold', active ? 'text-ink' : 'text-mute')}>
                  {item.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-mute">{item.hint}</p>
            </li>
          )
        })}
      </ol>

      {step === 1 ? (
        <DashboardPanel className="flex min-h-[calc(100dvh-16rem)] flex-col p-5 sm:p-6 lg:p-8">
          <h2 className="font-display text-lg tracking-tight text-ink">{t('sections.details')}</h2>
          <p className="mt-1 text-sm text-mute">{t('sections.detailsHint')}</p>

          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="text-sm font-medium text-ink">
                {t('fields.name')}
              </label>
              <Input
                id={nameId}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('fields.namePlaceholder')}
                className="h-11 rounded-xl border-dash-border"
              />
              <p className="text-xs text-mute">{t('fields.nameHelp')}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="plan-desc" className="text-sm font-medium text-ink">
                {t('fields.description')}
              </label>
              <textarea
                id="plan-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('fields.descriptionPlaceholder')}
                className={cn(selectClassName, 'h-auto min-h-[7rem] py-2.5')}
              />
              <p className="text-xs text-mute">{t('fields.descriptionHelp')}</p>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-dash-border px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={form.customPricing}
                onChange={(e) =>
                  setForm({
                    ...form,
                    customPricing: e.target.checked,
                    billingPeriod: e.target.checked ? 'custom' : 'monthly',
                  })
                }
              />
              <span>
                <span className="block text-sm font-medium text-ink">{t('fields.customPricing')}</span>
                <span className="text-xs text-mute">{t('fields.customPricingHelp')}</span>
              </span>
            </label>

            {!form.customPricing ? (
              <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="plan-currency" className="text-sm font-medium text-ink">
                    {t('fields.currency')}
                  </label>
                  <select id="plan-currency" value={form.currency} disabled className={selectClassName}>
                    <option value="INR">{t('currency.inr')}</option>
                    <option value="USD">{t('currency.usd')}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="plan-price" className="text-sm font-medium text-ink">
                    {t('fields.price')}
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="plan-price"
                      type="number"
                      min="0"
                      step="1"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className="h-11 rounded-xl border-dash-border"
                    />
                    <p className="shrink-0 text-sm text-mute">
                      {form.billingPeriod === 'yearly' ? t('perYear') : t('perMonth')}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {!form.customPricing ? (
              <div>
                <p className="text-sm font-medium text-ink">{t('fields.billingPeriod')}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(['monthly', 'yearly'] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-left',
                        form.billingPeriod === period
                          ? 'border-primary bg-primary-pale/50'
                          : 'border-dash-border bg-canvas hover:border-dash-border-strong'
                      )}
                      onClick={() => setForm({ ...form, billingPeriod: period })}
                    >
                      <span className="block text-sm font-semibold text-ink">{t(`billing.${period}`)}</span>
                      <span className="text-xs text-mute">{t(`billing.${period}Hint`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <h3 className="text-sm font-semibold text-ink">{t('sections.limits')}</h3>
              <p className="mt-0.5 text-xs text-mute">{t('sections.limitsHint')}</p>
              <div className="mt-3 flex flex-col gap-5">
                {LIMIT_FIELD_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">
                      {group.title}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {group.fields.map((field) => (
                        <div key={field} className="flex flex-col gap-1.5">
                          <label htmlFor={`plan-${field}`} className="text-sm font-medium text-ink">
                            {field}
                            {ANTI_ABUSE_FIELDS.has(field) ? ' *' : ''}
                          </label>
                          <Input
                            id={`plan-${field}`}
                            type="number"
                            min={ANTI_ABUSE_FIELDS.has(field) ? '1' : '0'}
                            value={form.limits[field]}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                limits: { ...form.limits, [field]: e.target.value },
                              })
                            }
                            placeholder={ANTI_ABUSE_FIELDS.has(field) ? undefined : t('unlimited')}
                            className="h-11 rounded-xl border-dash-border"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="plan-trial" className="text-sm font-medium text-ink">
                  {t('fields.trialDays')}
                </label>
                <Input
                  id="plan-trial"
                  type="number"
                  min="0"
                  value={form.trialDays}
                  onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
                  placeholder="0"
                  className="h-11 rounded-xl border-dash-border"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="plan-status" className="text-sm font-medium text-ink">
                  {t('fields.status')}
                </label>
                <select
                  id="plan-status"
                  value={form.status}
                  className={selectClassName}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as Exclude<PlanStatus, 'archived'> })
                  }
                >
                  <option value="draft">{t('statuses.draft')}</option>
                  <option value="active">{t('statuses.active')}</option>
                </select>
              </div>
            </div>
          </div>

          {error && step === 1 ? (
            <p role="alert" className="mt-4 text-sm text-negative">
              {error}
            </p>
          ) : null}

          <div className="mt-auto flex flex-col-reverse gap-2 border-t border-dash-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/plans')}>
              {t('cancel')}
            </Button>
            <Button type="button" className="gap-2" onClick={goNext}>
              {t('nextFeatures')}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </DashboardPanel>
      ) : (
        <DashboardPanel className="flex min-h-[calc(100dvh-16rem)] flex-col p-5 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-lg tracking-tight text-ink">{t('sections.features')}</h2>
              <p className="mt-1 text-sm text-mute">{t('sections.featuresHint')}</p>
            </div>
            <p className="text-sm font-medium text-positive-deep">
              {t('selectedCount', { count: selectedCount, total: PLAN_FEATURE_CATALOG.length })}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            {CATEGORIES.map((category) => {
              const items = PLAN_FEATURE_CATALOG.filter((item) => item.category === category)
              return (
                <section key={category}>
                  <h3 className="text-sm font-semibold text-ink">{t(`categories.${category}`)}</h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {items.map((item) => {
                      const state = form.features[item.key] ?? { enabled: false, description: '' }
                      return (
                        <li
                          key={item.key}
                          className={cn(
                            'rounded-xl border px-4 py-3',
                            state.enabled ? 'border-primary/35 bg-primary-pale/30' : 'border-dash-border'
                          )}
                        >
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 size-4 accent-primary"
                              checked={state.enabled}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  features: {
                                    ...form.features,
                                    [item.key]: { ...state, enabled: e.target.checked },
                                  },
                                })
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-ink">
                                {t(`featureItems.${item.key}`)}
                              </span>
                              {state.enabled ? (
                                <input
                                  type="text"
                                  value={state.description}
                                  placeholder={t('fields.benefitPlaceholder')}
                                  className="mt-2 h-9 w-full rounded-lg border border-dash-border bg-canvas px-3 text-sm text-ink outline-none focus-visible:border-primary/55"
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      features: {
                                        ...form.features,
                                        [item.key]: { ...state, description: e.target.value },
                                      },
                                    })
                                  }
                                />
                              ) : null}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>

          {error && step === 2 ? (
            <p role="alert" className="mt-4 text-sm text-negative">
              {error}
            </p>
          ) : null}

          <div className="mt-auto flex flex-col-reverse gap-2 border-t border-dash-border pt-4 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              {t('back')}
            </Button>
            <Button type="button" className="gap-2" disabled={pending} onClick={() => void handleSubmit()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? t('saving') : mode === 'edit' ? t('savePlan') : t('createPlan')}
            </Button>
          </div>
        </DashboardPanel>
      )}
    </div>
  )
}
