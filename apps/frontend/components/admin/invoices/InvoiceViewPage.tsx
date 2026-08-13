'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { InvoiceDocument } from './InvoiceDocument'
import { downloadInvoice, getInvoice, getPlatformBillingProfile } from './invoice-service'
import type { Invoice } from './types'

type InvoiceViewPageProps = {
  invoiceId: string
}

export function InvoiceViewPage({ invoiceId }: InvoiceViewPageProps) {
  const t = useTranslations('admin.invoices')
  const router = useRouter()
  const searchParams = useSearchParams()
  const platform = getPlatformBillingProfile()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadPending, setDownloadPending] = useState(false)
  const [banner, setBanner] = useState<string | null>(
    searchParams.get('created') === '1' ? t('toast.created') : null
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void getInvoice(invoiceId).then((result) => {
      if (cancelled) return
      if (!result) {
        setInvoice(null)
        setError(t('errors.notFound'))
      } else {
        setInvoice(result)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [invoiceId, t])

  useEffect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-invoice-print', 'true')
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        .invoice-document, .invoice-document * { visibility: visible !important; }
        .invoice-document {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
      }
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  async function handleDownload() {
    if (!invoice) return
    setDownloadPending(true)
    try {
      const result = await downloadInvoice(invoice.id)
      setBanner(t(result.messageKey ?? 'actions.downloadSoon'))
    } finally {
      setDownloadPending(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-mute">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="flex w-full flex-col gap-4">
        <Link
          href="/admin/invoices"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
        >
          <ArrowLeft className="size-4" />
          {t('backToInvoices')}
        </Link>
        <DashboardPanel className="px-5 py-12 text-center">
          <p role="alert" className="text-sm text-negative">
            {error ?? t('errors.notFound')}
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => router.push('/admin/invoices')}>
            {t('backToInvoices')}
          </Button>
        </DashboardPanel>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-5 print:gap-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div>
          <Link
            href="/admin/invoices"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-positive-deep hover:underline"
          >
            <ArrowLeft className="size-4" />
            {t('backToInvoices')}
          </Link>
          <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-2xl">
            {t('previewTitle')}
          </h1>
          <p className="mt-1 text-sm text-mute">{invoice.invoiceNumber}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={downloadPending}
            onClick={() => void handleDownload()}
          >
            {downloadPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('actions.downloadPdf')}
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={handlePrint}>
            <Printer className="size-4" />
            {t('actions.print')}
          </Button>
        </div>
      </div>

      {banner ? (
        <p
          role="status"
          className="rounded-xl border border-primary/30 bg-primary-pale/50 px-4 py-3 text-sm text-positive-deep print:hidden"
        >
          {banner}
        </p>
      ) : null}

      <div className="w-full print:p-0">
        <InvoiceDocument invoice={invoice} platform={platform} variant="view" />
      </div>
    </div>
  )
}
