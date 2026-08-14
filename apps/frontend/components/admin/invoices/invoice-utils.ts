import type { InvoiceBillingPeriod, InvoiceStatus } from './types'

export function formatMoney(amount: number, currency = 'USD') {
  const code = currency.trim().toUpperCase() || 'USD'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }
}

export function formatInvoiceDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatPeriodRange(start: string, end: string) {
  return `${formatInvoiceDate(start)} – ${formatInvoiceDate(end)}`
}

export function billingPeriodLabel(
  period: InvoiceBillingPeriod,
  labels: Record<InvoiceBillingPeriod, string>
) {
  return labels[period]
}

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function statusTone(status: InvoiceStatus) {
  switch (status) {
    case 'paid':
      return 'bg-primary-pale text-positive-deep ring-primary/25'
    case 'pending':
      return 'bg-[#FFF4E5] text-[#B45309] ring-[#FDBA74]/50'
    case 'overdue':
      return 'bg-negative/10 text-negative ring-negative/25'
    case 'cancelled':
      return 'bg-mute/15 text-mute ring-dash-border'
    default:
      return 'bg-mute/15 text-mute ring-dash-border'
  }
}

export function issueMonthOptions(fromYear = 2026, monthsBack = 12) {
  const options: Array<{ value: string; label: string }> = []
  const now = new Date()
  for (let i = 0; i < monthsBack; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    options.push({ value, label })
    if (d.getFullYear() < fromYear && d.getMonth() === 0) break
  }
  return options
}
