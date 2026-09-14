import {
  EMPTY_PLATFORM_BILLING_PROFILE,
  type PlatformBillingProfile,
} from '#lib/platform_billing_profile'
import type { InvoiceBillingPeriod, InvoiceStatus, SuperAdminInvoice } from '#types/invoices'

/** A4 in PDF points. */
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 40
const MARGIN_TOP = 40
const MARGIN_BOTTOM = 48
const CONTENT_W = PAGE_W - MARGIN_X * 2

const COLOR = {
  text: [0.067, 0.094, 0.153] as const, // #111827
  muted: [0.42, 0.447, 0.502] as const, // #6B7280
  body: [0.216, 0.255, 0.318] as const, // #374151
  border: [0.898, 0.906, 0.922] as const, // #E5E7EB
  cardBg: [0.976, 0.98, 0.984] as const, // #F9FAFB
  primary: [0.145, 0.388, 0.922] as const, // #2563eb
  white: [1, 1, 1] as const,
  paidBg: [0.86, 0.96, 0.9] as const,
  paidFg: [0.06, 0.4, 0.24] as const,
  pendingBg: [1, 0.957, 0.898] as const,
  pendingFg: [0.706, 0.325, 0.035] as const,
  overdueBg: [0.996, 0.91, 0.91] as const,
  overdueFg: [0.72, 0.11, 0.11] as const,
  cancelledBg: [0.94, 0.94, 0.95] as const,
  cancelledFg: [0.42, 0.447, 0.502] as const,
}

/** WinAnsi / PDFDoc-friendly em dash for empty GSTIN fallback (matches preview `—`). */
const EM_DASH = String.fromCharCode(0x97)
/** WinAnsi middle dot (matches preview `·` in line-item detail). */
const MIDDLE_DOT = String.fromCharCode(0xb7)

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

const BILLING_PERIOD_LABEL: Record<InvoiceBillingPeriod, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom',
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function pdfEscape(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (ch === '\\' || ch === '(' || ch === ')') {
      out += `\\${ch}`
      continue
    }
    // Printable ASCII + WinAnsi (includes em dash 0x97, middle dot 0xB7, etc.)
    if ((code >= 32 && code <= 126) || (code >= 128 && code <= 255)) {
      out += ch
      continue
    }
    out += '?'
  }
  return out
}

/** Map common Unicode punctuation to WinAnsi / ASCII so Helvetica can render it. */
function normalizePdfText(value: string): string {
  return value
    .replaceAll(/\u00B7/g, MIDDLE_DOT)
    .replaceAll(/[•∙⋅]/g, MIDDLE_DOT)
    .replaceAll(/[\u2018\u2019]/g, "'")
    .replaceAll(/[\u201C\u201D]/g, '"')
    .replaceAll(/\u2013/g, '-')
    .replaceAll(/\u2014/g, EM_DASH)
    .replaceAll(/\u2212/g, '-')
    .replaceAll(/\u00A0/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function wrapText(value: string, maxChars: number): string[] {
  const text = normalizePdfText(value)
  if (!text) return []
  if (maxChars < 8) maxChars = 8
  const lines: string[] = []
  let remaining = text
  while (remaining.length > maxChars) {
    let breakAt = remaining.lastIndexOf(' ', maxChars)
    if (breakAt < 1) breakAt = maxChars
    lines.push(remaining.slice(0, breakAt).trimEnd())
    remaining = remaining.slice(breakAt).trimStart()
  }
  if (remaining) lines.push(remaining)
  return lines
}

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${amount.toFixed(2)}`
}

function formatInvoiceDate(value: string | null | undefined): string {
  if (!value) return EM_DASH
  const raw = value.includes('T') ? value : `${value}T00:00:00.000Z`
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return normalizePdfText(value)
  const day = date.getUTCDate()
  const month = MONTH_SHORT[date.getUTCMonth()]
  const year = date.getUTCFullYear()
  return `${month} ${day}, ${year}`
}

function formatPeriodRange(start: string, end: string): string {
  return `${formatInvoiceDate(start)} - ${formatInvoiceDate(end)}`
}

function taxPercentLabel(taxRate: number): number {
  return Math.round(taxRate * 100)
}

function statusColors(status: InvoiceStatus): {
  bg: readonly [number, number, number]
  fg: readonly [number, number, number]
} {
  switch (status) {
    case 'paid':
      return { bg: COLOR.paidBg, fg: COLOR.paidFg }
    case 'pending':
      return { bg: COLOR.pendingBg, fg: COLOR.pendingFg }
    case 'overdue':
      return { bg: COLOR.overdueBg, fg: COLOR.overdueFg }
    default:
      return { bg: COLOR.cancelledBg, fg: COLOR.cancelledFg }
  }
}

function rgb(color: readonly [number, number, number]): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)}`
}

export function invoicePdfFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `invoice-${safe || 'document'}.pdf`
}

type TextStyle = 'regular' | 'bold'

type PageBuffer = {
  ops: string[]
}

/**
 * Layout helpers for a structured invoice matching InvoiceDocument.
 * Coordinates: PDF origin bottom-left; `y` is the current top cursor (descending).
 */
class InvoicePdfLayout {
  readonly pages: PageBuffer[] = [{ ops: [] }]
  y = PAGE_H - MARGIN_TOP
  private pageIndex = 0

  private get page(): PageBuffer {
    return this.pages[this.pageIndex]!
  }

  push(op: string) {
    this.page.ops.push(op)
  }

  ensureSpace(needed: number) {
    if (this.y - needed >= MARGIN_BOTTOM) return
    this.newPage()
  }

  newPage() {
    this.pages.push({ ops: [] })
    this.pageIndex = this.pages.length - 1
    this.y = PAGE_H - MARGIN_TOP
  }

  setFill(color: readonly [number, number, number]) {
    this.push(`${rgb(color)} rg`)
  }

  setStroke(color: readonly [number, number, number]) {
    this.push(`${rgb(color)} RG`)
  }

  rect(x: number, yBottom: number, w: number, h: number, style: 'fill' | 'stroke' | 'fillStroke') {
    this.push(`${x.toFixed(2)} ${yBottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`)
    if (style === 'fill') this.push('f')
    else if (style === 'stroke') this.push('S')
    else this.push('B')
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.75) {
    this.push(`${width.toFixed(2)} w`)
    this.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
  }

  text(
    value: string,
    x: number,
    baseline: number,
    size: number,
    style: TextStyle = 'regular',
    color: readonly [number, number, number] = COLOR.text
  ) {
    const font = style === 'bold' ? '/F2' : '/F1'
    const escaped = pdfEscape(normalizePdfText(value))
    this.push('BT')
    this.push(`${rgb(color)} rg`)
    this.push(`${font} ${size} Tf`)
    this.push(`${x.toFixed(2)} ${baseline.toFixed(2)} Td`)
    this.push(`(${escaped}) Tj`)
    this.push('ET')
  }

  textRight(
    value: string,
    rightX: number,
    baseline: number,
    size: number,
    style: TextStyle = 'regular',
    color: readonly [number, number, number] = COLOR.text
  ) {
    const approx = normalizePdfText(value).length * size * 0.5
    this.text(value, rightX - approx, baseline, size, style, color)
  }

  /** Draw wrapped text; returns bottom baseline used. */
  textBlock(
    value: string,
    x: number,
    topY: number,
    size: number,
    maxChars: number,
    style: TextStyle = 'regular',
    color: readonly [number, number, number] = COLOR.text,
    lineGap = 3
  ): number {
    const lines = wrapText(value, maxChars)
    let baseline = topY - size
    for (const line of lines) {
      this.ensureSpace(size + lineGap + 4)
      if (baseline < MARGIN_BOTTOM + size) {
        this.newPage()
        baseline = this.y - size
      }
      this.text(line, x, baseline, size, style, color)
      baseline -= size + lineGap
    }
    return lines.length === 0 ? topY : baseline + size + lineGap
  }
}

function drawBrandMark(layout: InvoicePdfLayout, x: number, yTop: number) {
  const size = 28
  const yBottom = yTop - size
  layout.setFill(COLOR.primary)
  layout.rect(x, yBottom, size, size, 'fill')
  // Simple chat-bubble mark (white) inside the blue tile
  layout.setFill(COLOR.white)
  layout.rect(x + 7, yBottom + 10, 14, 10, 'fill')
  layout.push(
    `${(x + 10).toFixed(2)} ${(yBottom + 10).toFixed(2)} m ${(x + 7).toFixed(2)} ${(yBottom + 5).toFixed(2)} l ${(x + 14).toFixed(2)} ${(yBottom + 10).toFixed(2)} l f`
  )
}

function drawStatusBadge(
  layout: InvoicePdfLayout,
  status: InvoiceStatus,
  rightX: number,
  yTop: number
) {
  const label = STATUS_LABEL[status] ?? status
  const { bg, fg } = statusColors(status)
  const padX = 8
  const height = 16
  const width = Math.max(48, label.length * 6 + padX * 2)
  const x = rightX - width
  const yBottom = yTop - height
  layout.setFill(bg)
  layout.setStroke(fg)
  layout.push('0.6 w')
  layout.rect(x, yBottom, width, height, 'fillStroke')
  layout.text(label, x + padX, yBottom + 4.5, 9, 'bold', fg)
}

/**
 * Structured PDF matching the Super Admin InvoiceDocument preview.
 * Data mapping mirrors the preview (no invented GSTIN / seller / customer fields).
 */
export function buildInvoicePdfBuffer(
  invoice: SuperAdminInvoice,
  platform: PlatformBillingProfile = EMPTY_PLATFORM_BILLING_PROFILE
): Buffer {
  const layout = new InvoicePdfLayout()
  const left = MARGIN_X
  const right = PAGE_W - MARGIN_X
  const midX = left + CONTENT_W / 2

  // --- Header: brand + invoice meta ---
  drawBrandMark(layout, left, layout.y)
  layout.text(platform.brandName || EM_DASH, left + 36, layout.y - 14, 16, 'bold')
  if (platform.tagline) {
    layout.text(platform.tagline, left + 36, layout.y - 28, 9, 'regular', COLOR.muted)
  }

  layout.text('INVOICE', right - 90, layout.y - 14, 20, 'bold')
  let metaY = layout.y - 36
  const metaRows: Array<{
    label: string
    value: string
    style?: TextStyle
    color?: readonly [number, number, number]
  }> = [
    {
      label: 'Invoice #:',
      value: invoice.invoiceNumber,
      style: 'bold',
      color: COLOR.primary,
    },
    { label: 'Issue Date:', value: formatInvoiceDate(invoice.issueDate) },
    { label: 'Due Date:', value: formatInvoiceDate(invoice.dueDate) },
  ]
  for (const row of metaRows) {
    layout.text(row.label, right - 200, metaY, 9, 'regular', COLOR.muted)
    layout.textRight(row.value, right, metaY, 9, row.style ?? 'regular', row.color ?? COLOR.text)
    metaY -= 14
  }
  layout.text('Status:', right - 200, metaY, 9, 'regular', COLOR.muted)
  drawStatusBadge(layout, invoice.status, right, metaY + 10)
  layout.y = Math.min(layout.y - 48, metaY - 28)

  layout.setStroke(COLOR.border)
  layout.line(left, layout.y, right, layout.y)
  layout.y -= 16

  // --- From / Billed To ---
  const sectionTop = layout.y
  layout.text('FROM', left, sectionTop - 10, 8, 'bold', COLOR.muted)
  layout.text('BILLED TO', midX + 12, sectionTop - 10, 8, 'bold', COLOR.muted)

  let fromY = sectionTop - 26
  layout.text(platform.legalName || EM_DASH, left, fromY, 10, 'bold')
  fromY -= 13
  for (const line of platform.addressLines) {
    const bottom = layout.textBlock(line, left, fromY + 10, 9, 42, 'regular', COLOR.body, 2)
    fromY = bottom - 12
  }
  layout.text(`GSTIN: ${platform.gstin.trim() || EM_DASH}`, left, fromY, 9, 'regular', COLOR.body)
  fromY -= 12
  if (platform.email) {
    layout.text(platform.email, left, fromY, 9, 'regular', COLOR.body)
    fromY -= 12
  }
  if (platform.phone) {
    layout.text(platform.phone, left, fromY, 9, 'regular', COLOR.body)
    fromY -= 12
  }

  let toY = sectionTop - 26
  const org = invoice.organization
  toY = layout.textBlock(org.name, midX + 12, toY + 10, 10, 40, 'bold', COLOR.text, 2) - 12
  if (org.address) {
    toY = layout.textBlock(org.address, midX + 12, toY + 10, 9, 40, 'regular', COLOR.body, 2) - 12
  }
  layout.text(org.email, midX + 12, toY, 9, 'regular', COLOR.body)
  toY -= 12
  if (org.phone) {
    layout.text(org.phone, midX + 12, toY, 9, 'regular', COLOR.body)
    toY -= 12
  }
  if (org.gstin?.trim()) {
    layout.text(`GSTIN: ${org.gstin.trim()}`, midX + 12, toY, 9, 'regular', COLOR.body)
    toY -= 12
  }

  layout.setStroke(COLOR.border)
  layout.line(midX, sectionTop - 4, midX, Math.min(fromY, toY) + 4)
  layout.y = Math.min(fromY, toY) - 10
  layout.line(left, layout.y, right, layout.y)
  layout.y -= 16

  // --- Plan / Organization cards ---
  layout.ensureSpace(56)
  const cardH = 52
  const cardGap = 10
  const cardW = (CONTENT_W - cardGap) / 2
  const cardY = layout.y - cardH

  const drawCard = (x: number, title: string, primary: string, secondary: string) => {
    layout.setFill(COLOR.cardBg)
    layout.setStroke(COLOR.border)
    layout.push('0.75 w')
    layout.rect(x, cardY, cardW, cardH, 'fillStroke')
    layout.setFill(COLOR.primary)
    layout.rect(x + 10, cardY + cardH - 28, 16, 16, 'fill')
    layout.text(title, x + 34, cardY + cardH - 16, 7, 'bold', COLOR.muted)
    layout.textBlock(primary, x + 34, cardY + cardH - 20, 10, 38, 'bold', COLOR.text, 1)
    layout.textBlock(secondary, x + 34, cardY + 18, 8, 42, 'regular', COLOR.muted, 1)
  }

  const periodLabel = BILLING_PERIOD_LABEL[invoice.billingPeriod] ?? invoice.billingPeriod
  drawCard(
    left,
    'SUBSCRIPTION / PLAN',
    `${invoice.planName} (${periodLabel})`,
    formatPeriodRange(invoice.periodStart, invoice.periodEnd)
  )
  drawCard(left + cardW + cardGap, 'ORGANIZATION', org.name, `Organization ID: ${org.id}`)
  layout.y = cardY - 16

  // --- Line items table ---
  const col = {
    desc: left,
    qty: left + CONTENT_W * 0.55,
    unit: left + CONTENT_W * 0.68,
    amount: right,
  }
  const headerH = 22

  const drawTableHeader = () => {
    layout.ensureSpace(headerH + 24)
    const yBottom = layout.y - headerH
    layout.setFill(COLOR.primary)
    layout.rect(left, yBottom, CONTENT_W, headerH, 'fill')
    const baseline = yBottom + 7
    layout.text('Description', col.desc + 8, baseline, 9, 'bold', COLOR.white)
    layout.textRight('Qty', col.qty + 24, baseline, 9, 'bold', COLOR.white)
    layout.textRight('Unit Price', col.unit + 40, baseline, 9, 'bold', COLOR.white)
    layout.textRight('Amount', col.amount - 8, baseline, 9, 'bold', COLOR.white)
    layout.y = yBottom
  }

  drawTableHeader()

  for (const item of invoice.lineItems) {
    const descLines = wrapText(item.description, 40)
    const detailLines = item.detail ? wrapText(item.detail, 42) : []
    const rowH = Math.max(28, 12 + descLines.length * 11 + detailLines.length * 10)

    if (layout.y - rowH < MARGIN_BOTTOM + 40) {
      layout.newPage()
      drawTableHeader()
    }

    const yBottom = layout.y - rowH
    layout.setStroke(COLOR.border)
    layout.push('0.6 w')
    layout.rect(left, yBottom, CONTENT_W, rowH, 'stroke')

    let textY = layout.y - 14
    for (const [i, line] of descLines.entries()) {
      layout.text(line, col.desc + 8, textY, 9, i === 0 ? 'bold' : 'regular')
      textY -= 11
    }
    for (const line of detailLines) {
      layout.text(line, col.desc + 8, textY, 8, 'regular', COLOR.muted)
      textY -= 10
    }

    const valueBaseline = layout.y - 14
    layout.textRight(String(item.quantity), col.qty + 24, valueBaseline, 9, 'regular', COLOR.body)
    layout.textRight(
      formatMoney(invoice.currency, item.unitPrice),
      col.unit + 40,
      valueBaseline,
      9,
      'regular',
      COLOR.body
    )
    layout.textRight(
      formatMoney(invoice.currency, item.amount),
      col.amount - 8,
      valueBaseline,
      9,
      'bold'
    )
    layout.y = yBottom
  }

  layout.y -= 14

  // --- Totals (right column) ---
  layout.ensureSpace(90)
  const totalsX = right - 200
  const totalsRows: Array<{
    label: string
    value: string
    bold?: boolean
    color?: readonly [number, number, number]
  }> = [{ label: 'Subtotal', value: formatMoney(invoice.currency, invoice.subtotal) }]
  if (invoice.discount > 0) {
    totalsRows.push({
      label: 'Discount',
      value: `-${formatMoney(invoice.currency, invoice.discount)}`,
      color: COLOR.primary,
    })
  }
  totalsRows.push({
    label: `Tax (${taxPercentLabel(invoice.taxRate)}% GST)`,
    value: formatMoney(invoice.currency, invoice.tax),
  })

  for (const row of totalsRows) {
    layout.text(row.label, totalsX, layout.y, 9, 'regular', COLOR.muted)
    layout.textRight(row.value, right, layout.y, 9, 'regular', row.color ?? COLOR.text)
    layout.y -= 14
  }
  layout.setStroke(COLOR.border)
  layout.line(totalsX, layout.y + 6, right, layout.y + 6)
  layout.y -= 4
  layout.text('Total', totalsX, layout.y, 11, 'bold')
  layout.textRight(
    formatMoney(invoice.currency, invoice.total),
    right,
    layout.y,
    12,
    'bold',
    COLOR.primary
  )
  layout.y -= 20

  // --- Amount in words + payment info ---
  layout.ensureSpace(70)
  const infoH = 64
  const infoW = (CONTENT_W - cardGap) / 2
  const infoY = layout.y - infoH

  layout.setFill(COLOR.cardBg)
  layout.setStroke(COLOR.border)
  layout.push('0.75 w')
  layout.rect(left, infoY, infoW, infoH, 'fillStroke')
  layout.rect(left + infoW + cardGap, infoY, infoW, infoH, 'fillStroke')

  layout.text('AMOUNT IN WORDS', left + 10, infoY + infoH - 14, 7, 'bold', COLOR.muted)
  layout.textBlock(
    `${formatMoney(invoice.currency, invoice.total)} Only`,
    left + 10,
    infoY + infoH - 20,
    9,
    36,
    'bold',
    COLOR.text,
    2
  )

  const payX = left + infoW + cardGap + 10
  layout.text('PAYMENT INFORMATION', payX, infoY + infoH - 14, 7, 'bold', COLOR.muted)
  layout.text('Payment Method', payX, infoY + infoH - 28, 8, 'regular', COLOR.muted)
  layout.textRight(
    invoice.paymentMethod?.trim() || 'Not paid',
    left + infoW * 2 + cardGap - 10,
    infoY + infoH - 28,
    8,
    'regular'
  )
  layout.text('Transaction ID', payX, infoY + infoH - 40, 8, 'regular', COLOR.muted)
  layout.textRight(
    invoice.transactionId?.trim() || EM_DASH,
    left + infoW * 2 + cardGap - 10,
    infoY + infoH - 40,
    8,
    'regular'
  )
  layout.text('Payment Date', payX, infoY + infoH - 52, 8, 'regular', COLOR.muted)
  layout.textRight(
    invoice.paymentDate ? formatInvoiceDate(invoice.paymentDate) : EM_DASH,
    left + infoW * 2 + cardGap - 10,
    infoY + infoH - 52,
    8,
    'regular'
  )
  layout.y = infoY - 16

  // --- Notes + thank you ---
  layout.ensureSpace(48)
  const notes =
    invoice.notes?.trim() ||
    'This invoice is generated by the platform. For billing queries, contact the operator using the seller details above.'
  layout.text('Notes', left, layout.y, 9, 'bold')
  layout.y -= 4
  layout.y = layout.textBlock(notes, left, layout.y, 9, 90, 'regular', COLOR.body, 2) - 10

  layout.text('Thank You!', left, layout.y, 10, 'bold', COLOR.primary)
  layout.y -= 12
  layout.y =
    layout.textBlock(
      'We appreciate your business and look forward to helping you automate WhatsApp conversations.',
      left,
      layout.y,
      9,
      90,
      'regular',
      COLOR.body,
      2
    ) - 16

  // --- Footer on each page ---
  const pageCount = layout.pages.length
  for (let i = 0; i < pageCount; i += 1) {
    const page = layout.pages[i]!
    const footerY = 28
    const push = (op: string) => page.ops.push(op)
    push(`${rgb(COLOR.border)} RG`)
    push('0.75 w')
    push(`${left.toFixed(2)} 40 m ${right.toFixed(2)} 40 l S`)
    push(`${rgb(COLOR.cardBg)} rg`)
    push(`${left.toFixed(2)} 18 ${CONTENT_W.toFixed(2)} 20 re f`)

    const writeFooter = (value: string, x: number, size = 8) => {
      push('BT')
      push(`${rgb(COLOR.muted)} rg`)
      push(`/F1 ${size} Tf`)
      push(`${x.toFixed(2)} ${footerY.toFixed(2)} Td`)
      push(`(${pdfEscape(normalizePdfText(value))}) Tj`)
      push('ET')
    }
    writeFooter(platform.website.trim() || EM_DASH, left)
    const pageLabel = `Page ${i + 1} of ${pageCount}`
    writeFooter(pageLabel, left + CONTENT_W / 2 - pageLabel.length * 2)
    const email = platform.email.trim() || EM_DASH
    writeFooter(email, right - email.length * 4.2)
  }

  return assemblePdf(layout.pages)
}

/** @deprecated Kept for callers/tests that want a plain-text dump of invoice fields. */
export function buildInvoicePdfLines(
  invoice: SuperAdminInvoice,
  platform: PlatformBillingProfile = EMPTY_PLATFORM_BILLING_PROFILE
): string[] {
  const periodLabel = BILLING_PERIOD_LABEL[invoice.billingPeriod] ?? invoice.billingPeriod
  const lines: string[] = [
    platform.brandName,
    platform.tagline,
    platform.legalName,
    ...platform.addressLines,
    `GSTIN: ${platform.gstin.trim() || EM_DASH}`,
  ]
  if (platform.email) lines.push(platform.email)
  if (platform.phone) lines.push(platform.phone)
  lines.push(
    'INVOICE',
    `Invoice #: ${invoice.invoiceNumber}`,
    `Issue Date: ${formatInvoiceDate(invoice.issueDate)}`,
    `Due Date: ${formatInvoiceDate(invoice.dueDate)}`,
    `Status: ${STATUS_LABEL[invoice.status] ?? invoice.status}`,
    'FROM',
    'BILLED TO',
    invoice.organization.name,
    invoice.organization.email
  )
  if (invoice.organization.phone) lines.push(invoice.organization.phone)
  if (invoice.organization.address) lines.push(...wrapText(invoice.organization.address, 90))
  if (invoice.organization.gstin?.trim()) {
    lines.push(`GSTIN: ${invoice.organization.gstin.trim()}`)
  }
  lines.push(
    'SUBSCRIPTION / PLAN',
    `${invoice.planName} (${periodLabel})`,
    formatPeriodRange(invoice.periodStart, invoice.periodEnd),
    'ORGANIZATION',
    `Organization ID: ${invoice.organization.id}`,
    'Description',
    'Qty',
    'Unit Price',
    'Amount'
  )
  for (const item of invoice.lineItems) {
    lines.push(item.description)
    if (item.detail) lines.push(normalizePdfText(item.detail))
    lines.push(
      String(item.quantity),
      formatMoney(invoice.currency, item.unitPrice),
      formatMoney(invoice.currency, item.amount)
    )
  }
  lines.push(
    `Subtotal: ${formatMoney(invoice.currency, invoice.subtotal)}`,
    `Tax (${taxPercentLabel(invoice.taxRate)}% GST): ${formatMoney(invoice.currency, invoice.tax)}`,
    `Total: ${formatMoney(invoice.currency, invoice.total)}`
  )
  if (invoice.discount > 0) {
    lines.push(`Discount: -${formatMoney(invoice.currency, invoice.discount)}`)
  }
  return lines
}

function assemblePdf(pages: PageBuffer[]): Buffer {
  const pageCount = pages.length
  const fontRegularId = 3
  const fontBoldId = 4
  const firstPageId = 5
  const kids = pages.map((_, index) => `${firstPageId + index * 2} 0 R`).join(' ')

  const objects: Buffer[] = []
  const add = (body: string | Buffer) => {
    objects.push(typeof body === 'string' ? Buffer.from(body, 'latin1') : body)
  }

  add('<< /Type /Catalog /Pages 2 0 R >>')
  add(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageCount} >>`)
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  for (const [index, page] of pages.entries()) {
    const pageId = firstPageId + index * 2
    const contentId = pageId + 1
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`
    )
    const stream = Buffer.from(page.ops.join('\n'), 'latin1')
    add(
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
        stream,
        Buffer.from('\nendstream', 'latin1'),
      ])
    )
  }

  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')
  const parts: Buffer[] = [header]
  const offsets = [0]
  let cursor = header.length

  for (const [index, object] of objects.entries()) {
    const objectId = index + 1
    const objectBytes = Buffer.concat([
      Buffer.from(`${objectId} 0 obj\n`, 'latin1'),
      object,
      Buffer.from('\nendobj\n', 'latin1'),
    ])
    offsets[objectId] = cursor
    parts.push(objectBytes)
    cursor += objectBytes.length
  }

  const xrefStart = cursor
  const size = objects.length + 1
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  parts.push(Buffer.from(xref, 'latin1'))
  parts.push(
    Buffer.from(
      `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
      'latin1'
    )
  )

  return Buffer.concat(parts)
}
