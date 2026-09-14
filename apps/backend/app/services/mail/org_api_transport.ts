import { OrganizationSmtpProviderPreset } from '#enums/organization_smtp_provider_preset'
import type {
  OrgMailSendParams,
  OrgMailTransport,
  OrgMailTransportConfig,
} from '#services/mail/org_mail_types'

type FetchFn = typeof fetch

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.slice(0, 500) || response.statusText
  } catch {
    return response.statusText
  }
}

async function sendViaResend(
  fetchImpl: FetchFn,
  apiKey: string,
  _config: OrgMailTransportConfig,
  message: OrgMailSendParams
) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${message.fromName} <${message.fromEmail}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  })

  if (!response.ok) {
    throw new Error(await readErrorBody(response))
  }
}

async function sendViaSendGrid(
  fetchImpl: FetchFn,
  apiKey: string,
  _config: OrgMailTransportConfig,
  message: OrgMailSendParams
) {
  const response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: message.fromEmail, name: message.fromName },
      subject: message.subject,
      content: [
        { type: 'text/html', value: message.html },
        ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(await readErrorBody(response))
  }
}

async function sendViaBrevo(
  fetchImpl: FetchFn,
  apiKey: string,
  _config: OrgMailTransportConfig,
  message: OrgMailSendParams
) {
  const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: message.fromName, email: message.fromEmail },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    }),
  })

  if (!response.ok) {
    throw new Error(await readErrorBody(response))
  }
}

export function createOrgApiTransport(deps?: { fetchImpl?: FetchFn }): OrgMailTransport {
  const fetchImpl = deps?.fetchImpl ?? fetch

  async function dispatch(config: OrgMailTransportConfig, message: OrgMailSendParams) {
    if (!config.apiKey) {
      throw new Error('API key is required')
    }

    switch (config.providerPreset) {
      case OrganizationSmtpProviderPreset.RESEND:
        await sendViaResend(fetchImpl, config.apiKey, config, message)
        return
      case OrganizationSmtpProviderPreset.SENDGRID:
        await sendViaSendGrid(fetchImpl, config.apiKey, config, message)
        return
      case OrganizationSmtpProviderPreset.BREVO:
        await sendViaBrevo(fetchImpl, config.apiKey, config, message)
        return
      default:
        throw new Error(`Provider preset "${config.providerPreset}" does not support API transport`)
    }
  }

  return {
    async verify(config) {
      await dispatch(config, {
        fromName: config.senderName,
        fromEmail: config.senderEmail,
        to: config.senderEmail,
        subject: 'Whats-Auto mail verification',
        html: '<p>Whats-Auto mail verification probe.</p>',
      })
    },
    async send(config, message) {
      await dispatch(config, message)
    },
  }
}

export const orgApiTransport = createOrgApiTransport()
