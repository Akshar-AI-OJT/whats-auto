import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const mailer = env.get('MAIL_MAILER')

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
        pass: env.get('SMTP_PASSWORD')?.release() ?? '',
      },
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
