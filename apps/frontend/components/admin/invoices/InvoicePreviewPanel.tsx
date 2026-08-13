'use client'

import { cn } from '@/lib/utils'
import { InvoiceDocument } from './InvoiceDocument'
import { getPlatformBillingProfile } from './invoice-service'
import type { Invoice } from './types'

type InvoicePreviewPanelProps = {
  invoice: Invoice
  title?: string
  hint?: string
  className?: string
}

/**
 * Right-side live preview shell. Full-opacity invoice with no inner panel scroll —
 * the page scrolls as a whole so the document stays fully readable.
 */
export function InvoicePreviewPanel({
  invoice,
  title,
  hint,
  className,
}: InvoicePreviewPanelProps) {
  const platform = getPlatformBillingProfile()

  return (
    <aside
      className={cn(
        'flex flex-col rounded-2xl border border-dash-border bg-canvas/95',
        className
      )}
    >
      {(title || hint) && (
        <div className="border-b border-dash-border px-4 py-3 sm:px-5">
          {title ? <h2 className="font-display text-base font-semibold text-ink">{title}</h2> : null}
          {hint ? <p className="mt-0.5 text-xs text-mute">{hint}</p> : null}
        </div>
      )}

      <div className="px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
        <div className="mx-auto w-full max-w-[720px] opacity-100">
          <InvoiceDocument invoice={invoice} platform={platform} variant="preview" />
        </div>
      </div>
    </aside>
  )
}
