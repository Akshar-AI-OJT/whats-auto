import mail from '@adonisjs/mail/services/main'
import { PLATFORM_BILLING_PROFILE } from '#lib/platform_billing_profile'
import type { SuperAdminInvoice } from '#types/invoices'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${amount.toFixed(2)}`
}

export function buildInvoiceEmail(invoice: SuperAdminInvoice): {
  subject: string
  text: string
  html: string
} {
  const platform = PLATFORM_BILLING_PROFILE
  const subject = `Invoice ${invoice.invoiceNumber} from ${platform.brandName}`
  const total = formatMoney(invoice.currency, invoice.total)
  const orgName = invoice.organization.name

  const text = [
    `Hello ${orgName},`,
    '',
    `Please find invoice ${invoice.invoiceNumber} attached.`,
    `Amount due: ${total}`,
    `Issue date: ${invoice.issueDate}`,
    `Due date: ${invoice.dueDate}`,
    `Status: ${invoice.status}`,
    '',
    `For billing queries, contact ${platform.email}.`,
    '',
    `— ${platform.brandName}`,
  ].join('\n')

  const html = `
      <div style="margin:0; padding:40px 20px; background-color:#f4f6f8; font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
          <div style="padding:28px 32px; border-bottom:1px solid #e5e7eb;">
            <div style="font-size:22px; font-weight:700; color:#111827;">${escapeHtml(platform.brandName)}</div>
          </div>
          <div style="padding:32px;">
            <h1 style="margin:0 0 16px; font-size:24px; line-height:32px; color:#111827;">Invoice ${escapeHtml(invoice.invoiceNumber)}</h1>
            <p style="margin:0 0 24px; font-size:15px; line-height:24px; color:#4b5563;">
              Hello ${escapeHtml(orgName)}, your invoice is attached as a PDF.
            </p>
            <p style="margin:0 0 8px; font-size:15px; line-height:24px; color:#111827;">
              <strong>Amount:</strong> ${escapeHtml(total)}
            </p>
            <p style="margin:0 0 8px; font-size:15px; line-height:24px; color:#111827;">
              <strong>Issue date:</strong> ${escapeHtml(invoice.issueDate)}
            </p>
            <p style="margin:0 0 8px; font-size:15px; line-height:24px; color:#111827;">
              <strong>Due date:</strong> ${escapeHtml(invoice.dueDate)}
            </p>
            <p style="margin:0; font-size:13px; line-height:20px; color:#6b7280;">
              For billing queries, contact ${escapeHtml(platform.email)}.
            </p>
          </div>
          <div style="padding:20px 32px; background:#f9fafb; border-top:1px solid #e5e7eb;">
            <p style="margin:0; font-size:12px; line-height:18px; color:#9ca3af; text-align:center;">
              This is an automated email from ${escapeHtml(platform.brandName)}. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `

  return { subject, text, html }
}

export async function sendInvoiceEmail(params: {
  to: string
  invoice: SuperAdminInvoice
  pdf: Buffer
  filename: string
}) {
  const { subject, text, html } = buildInvoiceEmail(params.invoice)
  await mail.send((message) => {
    message.to(params.to).subject(subject).text(text).html(html)
    message.attachData(params.pdf, {
      filename: params.filename,
    })
  })
}
