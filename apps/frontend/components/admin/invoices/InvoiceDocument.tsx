'use client'

import { Building2, CreditCard, FileText, Heart, Info, MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { Invoice, PlatformBillingProfile } from './types'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'
import {
  billingPeriodLabel,
  formatInvoiceDate,
  formatMoney,
  formatPeriodRange,
} from './invoice-utils'

type InvoiceDocumentProps = {
  invoice: Invoice
  platform: PlatformBillingProfile
  className?: string
  /** preview = live generate panel; view = full-page read; print = print layout */
  variant?: 'preview' | 'view' | 'print'
}

export function InvoiceDocument({
  invoice,
  platform,
  className,
  variant = 'view',
}: InvoiceDocumentProps) {
  const t = useTranslations('admin.invoices')

  return (
    <article
      className={cn(
        'invoice-document isolate w-full opacity-100',
        'rounded-2xl border border-[#E5E7EB] bg-white text-[#111827] shadow-[0_1px_3px_rgb(0_0_0/0.08)]',
        variant === 'preview' ? 'max-w-none' : 'mx-auto max-w-[880px]',
        className
      )}
    >
      <div className="px-6 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] text-white">
              <MessageCircle className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-display text-xl font-semibold tracking-tight text-[#111827]">
                {platform.brandName}
              </p>
              <p className="text-sm text-[#6B7280]">{platform.tagline}</p>
            </div>
          </div>

          <div className="sm:text-right">
            <p className="font-display text-2xl font-semibold tracking-tight text-[#111827] sm:text-3xl">
              {t('document.title')}
            </p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-[#6B7280]">{t('document.invoiceNumber')}</dt>
                <dd className="font-semibold text-[#2563eb]">{invoice.invoiceNumber}</dd>
              </div>
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-[#6B7280]">{t('document.issueDate')}</dt>
                <dd className="tabular-nums text-[#111827]">{formatInvoiceDate(invoice.issueDate)}</dd>
              </div>
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-[#6B7280]">{t('document.dueDate')}</dt>
                <dd className="tabular-nums text-[#111827]">{formatInvoiceDate(invoice.dueDate)}</dd>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <dt className="text-[#6B7280]">{t('columns.status')}</dt>
                <dd>
                  <InvoiceStatusBadge status={invoice.status} label={t(`statuses.${invoice.status}`)} />
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="mt-8 grid gap-6 border-y border-[#E5E7EB] py-6 sm:grid-cols-2 sm:gap-8">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[#6B7280] uppercase">
              {t('document.from')}
            </p>
            <p className="mt-2 font-semibold text-[#111827]">{platform.legalName}</p>
            {platform.addressLines.map((line) => (
              <p key={line} className="text-sm text-[#374151]">
                {line}
              </p>
            ))}
            <p className="mt-2 text-sm text-[#374151]">
              {t('document.gstin')}: {platform.gstin}
            </p>
            <p className="text-sm text-[#374151]">{platform.email}</p>
            <p className="text-sm text-[#374151]">{platform.phone}</p>
          </div>
          <div className="sm:border-l sm:border-[#E5E7EB] sm:pl-8">
            <p className="text-xs font-semibold tracking-wide text-[#6B7280] uppercase">
              {t('document.billedTo')}
            </p>
            <p className="mt-2 font-semibold text-[#111827]">{invoice.organization.name}</p>
            {invoice.organization.address ? (
              <p className="text-sm text-[#374151]">{invoice.organization.address}</p>
            ) : null}
            <p className="mt-2 text-sm text-[#374151]">{invoice.organization.email}</p>
            {invoice.organization.phone ? (
              <p className="text-sm text-[#374151]">{invoice.organization.phone}</p>
            ) : null}
            {invoice.organization.gstin ? (
              <p className="text-sm text-[#374151]">
                {t('document.gstin')}: {invoice.organization.gstin}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
              <FileText className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-[#6B7280] uppercase">
                {t('document.subscriptionPlan')}
              </p>
              <p className="mt-0.5 font-semibold text-[#111827]">
                {invoice.planName} (
                {billingPeriodLabel(invoice.billingPeriod, {
                  monthly: t('billing.monthly'),
                  yearly: t('billing.yearly'),
                  custom: t('billing.custom'),
                })}
                )
              </p>
              <p className="text-xs text-[#6B7280]">
                {formatPeriodRange(invoice.periodStart, invoice.periodEnd)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
              <Building2 className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-[#6B7280] uppercase">
                {t('document.organization')}
              </p>
              <p className="mt-0.5 font-semibold text-[#111827]">{invoice.organization.name}</p>
              <p className="truncate text-xs text-[#6B7280]">
                {t('document.orgId')}: {invoice.organization.id}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[#E5E7EB]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#2563eb] text-white">
                <th className="px-4 py-3 font-semibold">{t('document.description')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('document.qty')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('document.unitPrice')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('document.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item) => (
                <tr key={item.id} className="border-t border-[#E5E7EB]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#111827]">{item.description}</p>
                    {item.detail ? <p className="text-xs text-[#6B7280]">{item.detail}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{item.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#374151]">
                    {formatMoney(item.unitPrice, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-[#111827]">
                    {formatMoney(item.amount, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between gap-6">
              <dt className="text-[#6B7280]">{t('document.subtotal')}</dt>
              <dd className="tabular-nums text-[#111827]">
                {formatMoney(invoice.subtotal, invoice.currency)}
              </dd>
            </div>
            {invoice.discount > 0 ? (
              <div className="flex justify-between gap-6">
                <dt className="text-[#6B7280]">{t('document.discount')}</dt>
                <dd className="tabular-nums text-[#2563eb]">
                  -{formatMoney(invoice.discount, invoice.currency)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-6">
              <dt className="text-[#6B7280]">
                {t('document.tax', { rate: Math.round(invoice.taxRate * 100) })}
              </dt>
              <dd className="tabular-nums text-[#111827]">{formatMoney(invoice.tax, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between gap-6 border-t border-[#E5E7EB] pt-2">
              <dt className="font-semibold text-[#111827]">{t('document.total')}</dt>
              <dd className="text-lg font-semibold tabular-nums text-[#2563eb]">
                {formatMoney(invoice.total, invoice.currency)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#6B7280] uppercase">
              <CreditCard className="size-3.5" aria-hidden />
              {t('document.amountInWords')}
            </div>
            <p className="mt-2 text-sm font-medium text-[#111827]">
              {t('document.amountWordsFallback', {
                amount: formatMoney(invoice.total, invoice.currency),
              })}
            </p>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-[#6B7280] uppercase">
              {t('document.paymentInfo')}
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B7280]">{t('document.paymentMethod')}</dt>
                <dd className="text-[#111827]">{invoice.paymentMethod ?? t('document.notPaid')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B7280]">{t('document.transactionId')}</dt>
                <dd className="truncate font-mono text-xs text-[#111827]">
                  {invoice.transactionId ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#6B7280]">{t('document.paymentDate')}</dt>
                <dd className="tabular-nums text-[#111827]">
                  {invoice.paymentDate ? formatInvoiceDate(invoice.paymentDate) : '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-[#6B7280]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[#111827]">{t('document.notes')}</p>
              <p className="mt-1 text-sm text-[#374151]">
                {invoice.notes?.trim() || t('document.defaultNotes')}
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563eb]">
              {t('document.thankYou')}
              <Heart className="size-3.5 fill-current" aria-hidden />
            </p>
            <p className="mt-1 text-sm text-[#374151]">{t('document.thankYouBody')}</p>
          </div>
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t border-[#E5E7EB] bg-[#F9FAFB] px-6 py-3 text-xs text-[#6B7280] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>{platform.website}</span>
        <span className="sm:text-center">{t('document.pageOf', { page: 1, total: 1 })}</span>
        <span className="sm:text-right">{platform.email}</span>
      </footer>
    </article>
  )
}
