import nodemailer from 'nodemailer'
import type {
  OrgMailSendParams,
  OrgMailTransport,
  OrgMailTransportConfig,
} from '#services/mail/org_mail_types'

function createTransporter(config: OrgMailTransportConfig) {
  if (!config.host || config.port === null || config.port === undefined || !config.username) {
    throw new Error('SMTP host, port, and username are required')
  }
  if (!config.password) {
    throw new Error('SMTP password is required')
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    auth: {
      type: 'login',
      user: config.username,
      pass: config.password,
    },
  })
}

export function createOrgSmtpTransport(deps?: {
  createTransporter?: typeof createTransporter
}): OrgMailTransport {
  const create = deps?.createTransporter ?? createTransporter

  return {
    async verify(config) {
      const transporter = create(config)
      await transporter.verify()
    },
    async send(config, message: OrgMailSendParams) {
      const transporter = create(config)
      await transporter.sendMail({
        from: { name: message.fromName, address: message.fromEmail },
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
    },
  }
}

export const orgSmtpTransport = createOrgSmtpTransport()
