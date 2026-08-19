declare module '@adonisjs/mail/services/main' {
  import type { MailManager } from '@adonisjs/mail'
  import type { MailersList } from '@adonisjs/mail/types'
  const mail: MailManager<MailersList>
  export default mail
}
