'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DEMO_PLAN_OPTIONS } from '@/components/admin/subscriptions/subscription-api'
import { InvoicePreviewPanel } from './InvoicePreviewPanel'
import {
  buildDraftInvoice,
  defaultLineItems,
  draftFormToCreateInput,
  emptyDraftForm,
  lineItemAmount,
  PLAN_DEFAULT_AMOUNTS,
  planSubscriptionLabel,
  validateDraftForm,
  type InvoiceDraftForm,
  type InvoiceFormLineItem,
} from './invoice-draft'
import { createInvoice, listInvoiceOrganizations } from './invoice-service'
import type { InvoiceBillingPeriod, InvoiceOrganization } from './types'

const selectClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

type Step = 1 | 2

function StepIndicator({ step }: { step: Step }) {
  const t = useTranslations('admin.invoices')

  const steps = [
    { id: 1 as const, label: t('steps.details') },
    { id: 2 as const, label: t('steps.review') },
  ]

  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((item, index) => {
        const active = step === item.id
        const done = step > item.id
        return (
          <li key={item.id} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold',
                active || done
                  ? 'bg-primary text-white'
                  : 'border border-dash-border bg-canvas text-mute'
              )}
            >
              {item.id}
            </span>
            <span className={cn('font-medium', active ? 'text-ink' : 'text-mute')}>{item.label}</span>
            {index < steps.length - 1 ? (
              <span className="mx-1 hidden text-mute sm:inline" aria-hidden>
                →
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export function GenerateInvoicePage() {
  const t = useTranslations('admin.invoices')
  const router = useRouter()
  const [organizations, setOrganizations] = useState<InvoiceOrganization[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)

  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<InvoiceDraftForm>(() => emptyDraftForm())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void listInvoiceOrganizations()
      .then((items) => {
        if (cancelled) return
        setOrganizations(items)
        if (items[0]) {
          setForm((current) =>
            current.organizationId ? current : { ...current, organizationId: items[0].id }
          )
        }
      })
      .catch(() => {
        if (!cancelled) setOrganizations([])
      })
      .finally(() => {
        if (!cancelled) setOrgsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedOrg = organizations.find((org) => org.id === form.organizationId) ?? null

  const draftInvoice = useMemo(
    () => buildDraftInvoice(form, selectedOrg),
    [form, selectedOrg]
  )

  function updateForm(next: InvoiceDraftForm) {
    setForm(next)
    setError(null)
  }

  function handlePlanChange(planName: string) {
    const unitPrice = PLAN_DEFAULT_AMOUNTS[planName]
    const lineItems = [...form.lineItems]
    if (lineItems[0]) {
      lineItems[0] = {
        ...lineItems[0],
        description: planSubscriptionLabel(planName, form.billingPeriod),
        unitPrice: unitPrice ?? lineItems[0].unitPrice,
      }
    } else {
      lineItems.push(...defaultLineItems(planName, form.billingPeriod))
    }
    updateForm({ ...form, planName, lineItems })
  }

  function handleBillingPeriodChange(billingPeriod: InvoiceBillingPeriod) {
    const lineItems = [...form.lineItems]
    if (lineItems[0]) {
      lineItems[0] = {
        ...lineItems[0],
        description: planSubscriptionLabel(form.planName, billingPeriod),
      }
    }
    updateForm({ ...form, billingPeriod, lineItems })
  }

  function updateLineItem(id: string, patch: Partial<InvoiceFormLineItem>) {
    updateForm({
      ...form,
      lineItems: form.lineItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  }

  function addLineItem() {
    updateForm({
      ...form,
      lineItems: [
        ...form.lineItems,
        {
          id: crypto.randomUUID(),
          description: '',
          quantity: 1,
          unitPrice: 0,
        },
      ],
    })
  }

  function removeLineItem(id: string) {
    if (form.lineItems.length <= 1) return
    updateForm({
      ...form,
      lineItems: form.lineItems.filter((item) => item.id !== id),
    })
  }

  function validate(): string | null {
    return validateDraftForm(form, {
      organizationRequired: t('errors.organizationRequired'),
      planRequired: t('errors.planRequired'),
      datesRequired: t('errors.datesRequired'),
      periodInvalid: t('errors.periodInvalid'),
      dueBeforeIssue: t('errors.dueBeforeIssue'),
      discountInvalid: t('errors.discountInvalid'),
      taxInvalid: t('errors.taxInvalid'),
      lineItemsRequired: t('errors.lineItemsRequired'),
      lineItemInvalid: t('errors.lineItemInvalid'),
    })
  }

  function goToReview() {
    const validation = validate()
    if (validation) {
      setError(validation)
      return
    }
    setStep(2)
    setError(null)
  }

  async function handleGenerate() {
    const validation = validate()
    if (validation) {
      setError(validation)
      setStep(1)
      return
    }
    if (!selectedOrg) {
      setError(t('errors.organizationRequired'))
      setStep(1)
      return
    }

    setPending(true)
    setError(null)
    try {
      const created = await createInvoice(draftFormToCreateInput(form, selectedOrg))
      router.push(`/admin/invoices/${created.id}?created=1`)
    } catch {
      setError(t('errors.createFailed'))
    } finally {
      setPending(false)
    }
  }

  const readOnly = step === 2

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-5 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div>
            <Link
              href="/admin/invoices"
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {t('backToInvoices')}
            </Link>
            <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('generateTitle')}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{t('generatePageSubtitle')}</p>
            <div className="mt-4">
              <StepIndicator step={step} />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 self-start xl:hidden"
            onClick={() => setMobilePreviewOpen((open) => !open)}
          >
            {mobilePreviewOpen ? t('hidePreview') : t('showPreview')}
          </Button>
        </div>

        {mobilePreviewOpen ? (
          <div className="xl:hidden">
            <InvoicePreviewPanel
              invoice={draftInvoice}
              title={t('previewTitle')}
              hint={t('previewLiveHint')}
            />
          </div>
        ) : null}

        <DashboardPanel as="section" className="min-w-0 p-4 sm:p-5">
          <h2 className="font-display text-lg tracking-tight text-ink">
            {step === 1 ? t('sections.invoiceDetails') : t('sections.reviewDetails')}
          </h2>
          <p className="mt-1 text-sm text-mute">
            {step === 1 ? t('sections.invoiceDetailsHint') : t('sections.reviewDetailsHint')}
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="gen-org" className="text-sm font-medium text-ink">
                {t('fields.organization')}
              </label>
              <select
                id="gen-org"
                value={form.organizationId}
                disabled={readOnly || pending || orgsLoading}
                className={selectClassName}
                onChange={(e) => updateForm({ ...form, organizationId: e.target.value })}
              >
                <option value="">{t('fields.organizationPlaceholder')}</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-plan" className="text-sm font-medium text-ink">
                  {t('fields.subscriptionPlan')}
                </label>
                <select
                  id="gen-plan"
                  value={form.planName}
                  disabled={readOnly || pending}
                  className={selectClassName}
                  onChange={(e) => handlePlanChange(e.target.value)}
                >
                  {DEMO_PLAN_OPTIONS.map((plan) => (
                    <option key={plan.id} value={plan.label}>
                      {plan.label} ({t('billing.monthly')})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-billing" className="text-sm font-medium text-ink">
                  {t('fields.billingPeriod')}
                </label>
                <select
                  id="gen-billing"
                  value={form.billingPeriod}
                  disabled={readOnly || pending}
                  className={selectClassName}
                  onChange={(e) =>
                    handleBillingPeriodChange(e.target.value as InvoiceBillingPeriod)
                  }
                >
                  <option value="monthly">{t('billing.monthly')}</option>
                  <option value="yearly">{t('billing.yearly')}</option>
                  <option value="custom">{t('billing.custom')}</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-period-start" className="text-sm font-medium text-ink">
                  {t('fields.periodStart')}
                </label>
                <Input
                  id="gen-period-start"
                  type="date"
                  value={form.periodStart}
                  disabled={readOnly || pending}
                  className="h-11 rounded-xl border-dash-border"
                  onChange={(e) => updateForm({ ...form, periodStart: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-period-end" className="text-sm font-medium text-ink">
                  {t('fields.periodEnd')}
                </label>
                <Input
                  id="gen-period-end"
                  type="date"
                  value={form.periodEnd}
                  disabled={readOnly || pending}
                  className="h-11 rounded-xl border-dash-border"
                  onChange={(e) => updateForm({ ...form, periodEnd: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-issue" className="text-sm font-medium text-ink">
                  {t('fields.issueDate')}
                </label>
                <Input
                  id="gen-issue"
                  type="date"
                  value={form.issueDate}
                  disabled={readOnly || pending}
                  className="h-11 rounded-xl border-dash-border"
                  onChange={(e) => updateForm({ ...form, issueDate: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-due" className="text-sm font-medium text-ink">
                  {t('fields.dueDate')}
                </label>
                <Input
                  id="gen-due"
                  type="date"
                  value={form.dueDate}
                  disabled={readOnly || pending}
                  className="h-11 rounded-xl border-dash-border"
                  onChange={(e) => updateForm({ ...form, dueDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-currency" className="text-sm font-medium text-ink">
                  {t('fields.currency')}
                </label>
                <select
                  id="gen-currency"
                  value={form.currency}
                  disabled
                  className={selectClassName}
                >
                  <option value="USD">{t('currency.usd')}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-tax" className="text-sm font-medium text-ink">
                  {t('fields.taxRate')}
                </label>
                <Input
                  id="gen-tax"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.taxRatePercent}
                  disabled={readOnly || pending}
                  className="h-11 rounded-xl border-dash-border"
                  onChange={(e) => updateForm({ ...form, taxRatePercent: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gen-discount" className="text-sm font-medium text-ink">
                  {t('fields.discount')}
                </label>
                <Input
                  id="gen-discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount}
                  disabled={readOnly || pending}
                  className="h-11 rounded-xl border-dash-border"
                  onChange={(e) => updateForm({ ...form, discount: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="gen-notes" className="text-sm font-medium text-ink">
                {t('fields.notes')}
              </label>
              <textarea
                id="gen-notes"
                rows={3}
                value={form.notes}
                disabled={readOnly || pending}
                className={cn(selectClassName, 'h-auto min-h-[5.5rem] py-2.5')}
                placeholder={t('fields.notesPlaceholder')}
                onChange={(e) => updateForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">{t('lineItems.title')}</h3>
              {!readOnly ? (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addLineItem}>
                  <Plus className="size-3.5" />
                  {t('lineItems.add')}
                </Button>
              ) : null}
            </div>

            <div className="mt-3 overflow-x-auto rounded-xl border border-dash-border">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-dash-surface/80 text-xs text-mute uppercase">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">{t('lineItems.description')}</th>
                    <th className="px-3 py-2.5 font-semibold">{t('lineItems.qty')}</th>
                    <th className="px-3 py-2.5 font-semibold">{t('lineItems.unitPrice')}</th>
                    <th className="px-3 py-2.5 font-semibold">{t('lineItems.amount')}</th>
                    {!readOnly ? (
                      <th className="px-3 py-2.5 text-right font-semibold">{t('lineItems.actions')}</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {form.lineItems.map((item) => (
                    <tr key={item.id} className="border-t border-dash-border">
                      <td className="px-3 py-2">
                        {readOnly ? (
                          <span className="text-ink">{item.description}</span>
                        ) : (
                          <Input
                            value={item.description}
                            className="h-9 rounded-lg border-dash-border text-sm"
                            onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {readOnly ? (
                          <span className="tabular-nums">{item.quantity}</span>
                        ) : (
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            className="h-9 w-20 rounded-lg border-dash-border text-sm"
                            onChange={(e) =>
                              updateLineItem(item.id, { quantity: Number(e.target.value) || 1 })
                            }
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {readOnly ? (
                          <span className="tabular-nums">{item.unitPrice.toFixed(2)}</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            className="h-9 w-24 rounded-lg border-dash-border text-sm"
                            onChange={(e) =>
                              updateLineItem(item.id, { unitPrice: Number(e.target.value) || 0 })
                            }
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium text-ink">
                        {lineItemAmount(item).toFixed(2)}
                      </td>
                      {!readOnly ? (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-dash-surface hover:text-negative disabled:opacity-40"
                            disabled={form.lineItems.length <= 1}
                            aria-label={t('lineItems.remove')}
                            onClick={() => removeLineItem(item.id)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-sm text-negative">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-dash-border pt-4 sm:flex-row sm:justify-between">
            {step === 1 ? (
              <>
                <Button type="button" variant="outline" onClick={() => router.push('/admin/invoices')}>
                  {t('cancel')}
                </Button>
                <Button type="button" className="gap-2" onClick={goToReview}>
                  {t('reviewNext')}
                  <ArrowRight className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" className="gap-2" onClick={() => setStep(1)}>
                  <Pencil className="size-4" />
                  {t('editDetails')}
                </Button>
                <Button
                  type="button"
                  className="gap-2"
                  disabled={pending}
                  onClick={() => void handleGenerate()}
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {pending ? t('generating') : t('generateSave')}
                </Button>
              </>
            )}
          </div>
        </DashboardPanel>
      </div>

      <aside className="hidden w-[min(48%,44rem)] shrink-0 xl:block">
        <InvoicePreviewPanel
          invoice={draftInvoice}
          title={t('previewTitle')}
          hint={t('previewLiveHint')}
        />
      </aside>
    </div>
  )
}
