import mail from '@adonisjs/mail/services/main'
import type { DateTime } from 'luxon'

export type DemoConfirmationEmailInput = {
  to: string
  fullName: string
  startsAt: DateTime
  endsAt: DateTime
  demoTimeZone: string
  viewerTimeZone: string
  meetingUrl: string | null
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatWhen(instant: DateTime, timeZone: string) {
  return instant.setZone(timeZone).toFormat("cccc, d LLLL yyyy 'at' h:mm a")
}

export function buildDemoConfirmationEmail(input: DemoConfirmationEmailInput): {
  subject: string
  text: string
  html: string
} {
  const dateLabel = formatWhen(input.startsAt, input.demoTimeZone)
  const durationLabel = `${Math.round(input.endsAt.diff(input.startsAt, 'minutes').minutes)} minutes`
  const viewerDiffers = input.viewerTimeZone !== input.demoTimeZone
  const viewerLabel = viewerDiffers ? formatWhen(input.startsAt, input.viewerTimeZone) : null

  const meetLine = input.meetingUrl
    ? `Google Meet: ${input.meetingUrl}`
    : 'Your Google Meet link will be shared separately if it is not included in this email.'

  const meetHtml = input.meetingUrl
    ? `<p style="margin:0 0 16px; font-size:15px; line-height:24px; color:#4b5563;">
        Join with Google Meet:<br>
        <a href="${escapeHtml(input.meetingUrl)}" style="color:#2563eb; font-weight:600;">${escapeHtml(input.meetingUrl)}</a>
      </p>`
    : `<p style="margin:0 0 16px; font-size:15px; line-height:24px; color:#4b5563;">
        Your Google Meet link will be shared separately if it is not included in this email.
      </p>`

  const viewerHtml = viewerLabel
    ? `<p style="margin:0 0 16px; font-size:13px; line-height:20px; color:#6b7280;">
        In your timezone (${escapeHtml(input.viewerTimeZone)}): ${escapeHtml(viewerLabel)}
      </p>`
    : ''

  const subject = `Your Whats-Auto demo is booked — ${input.startsAt.setZone(input.demoTimeZone).toFormat('d LLL yyyy, h:mm a')} ${input.demoTimeZone}`

  const text = [
    `Hi ${input.fullName},`,
    '',
    'Your Whats-Auto product demo is confirmed.',
    '',
    `Date and time: ${dateLabel} (${input.demoTimeZone})`,
    viewerLabel ? `In your timezone (${input.viewerTimeZone}): ${viewerLabel}` : null,
    `Duration: ${durationLabel}`,
    meetLine,
    '',
    'Please join a few minutes early. Have questions about your WhatsApp workflows ready so we can tailor the walkthrough.',
    '',
    '— Whats-Auto',
  ]
    .filter((line) => line !== null)
    .join('\n')

  const html = `
      <div style="margin:0; padding:40px 20px; background-color:#f4f6f8; font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
          <div style="padding:28px 32px; border-bottom:1px solid #e5e7eb;">
            <div style="font-size:22px; font-weight:700; color:#111827;">Whats-Auto</div>
          </div>
          <div style="padding:32px;">
            <h1 style="margin:0 0 16px; font-size:24px; line-height:32px; color:#111827;">Demo confirmed</h1>
            <p style="margin:0 0 24px; font-size:15px; line-height:24px; color:#4b5563;">
              Hi ${escapeHtml(input.fullName)}, your personalized Whats-Auto demo is booked.
            </p>
            <p style="margin:0 0 8px; font-size:15px; line-height:24px; color:#111827;">
              <strong>Date and time:</strong> ${escapeHtml(dateLabel)}
            </p>
            <p style="margin:0 0 8px; font-size:13px; line-height:20px; color:#6b7280;">
              Timezone: ${escapeHtml(input.demoTimeZone)} · Duration: ${escapeHtml(durationLabel)}
            </p>
            ${viewerHtml}
            ${meetHtml}
            <p style="margin:0; font-size:13px; line-height:20px; color:#6b7280;">
              Join a few minutes early. Bring questions about your WhatsApp workflows so we can tailor the walkthrough.
            </p>
          </div>
          <div style="padding:20px 32px; background:#f9fafb; border-top:1px solid #e5e7eb;">
            <p style="margin:0; font-size:12px; line-height:18px; color:#9ca3af; text-align:center;">
              This is an automated email from Whats-Auto. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `

  return { subject, text, html }
}

export async function sendDemoBookingConfirmationEmail(input: DemoConfirmationEmailInput) {
  const { subject, text, html } = buildDemoConfirmationEmail(input)
  await mail.send((message) => {
    message.to(input.to).subject(subject).text(text).html(html)
  })
}
