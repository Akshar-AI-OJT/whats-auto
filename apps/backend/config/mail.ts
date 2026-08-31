import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'
import { normalizeMailSecret } from '#lib/mail/normalize_mail_secret'

const mailer = env.get('MAIL_MAILER')

if (mailer === 'smtp') {
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD'] as const) {
    if (!env.get(key)) {
      throw new Error(`${key} is required when MAIL_MAILER=smtp`)
    }
  }
}

if (mailer === 'brevo' && !env.get('BREVO_API')) {
  throw new Error('BREVO_API is required when MAIL_MAILER=brevo')
}

const mailConfig = defineConfig({
  default: mailer,

  from: {
    address: env.get('MAIL_FROM_ADDRESS'),
    name: env.get('MAIL_FROM_NAME'),
  },

  globals: {
    brandName: 'WhatsAuto',
  },

  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST', 'localhost'),
      port: env.get('SMTP_PORT', 1025),
      secure: env.get('SMTP_PORT', 1025) === 465,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      auth: {
        type: 'login',
        user: env.get('SMTP_USERNAME', ''),
        pass: normalizeMailSecret(env.get('SMTP_PASSWORD')?.release()) ?? '',
      },
    }),
    brevo: transports.brevo({
      key: normalizeMailSecret(env.get('BREVO_API')?.release()) ?? '',
      baseUrl: 'https://api.brevo.com/v3',
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
