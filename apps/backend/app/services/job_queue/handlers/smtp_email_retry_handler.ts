import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import type { SmtpEmailRetryJobData } from '#services/mail/org_mail_types'
import { OrganizationSmtpService } from '#services/organization_smtp_service'

export function createSmtpEmailRetryHandler(
  service: OrganizationSmtpService = new OrganizationSmtpService()
): JobHandler {
  return async (job) => {
    const data = job.data as Partial<SmtpEmailRetryJobData>
    const organizationId = typeof data.organizationId === 'string' ? data.organizationId : null
    const attempt = typeof data.attempt === 'number' ? data.attempt : null
    const to = typeof data.to === 'string' ? data.to : null
    const subject = typeof data.subject === 'string' ? data.subject : null
    const html = typeof data.html === 'string' ? data.html : null

    if (!organizationId || !attempt || !to || !subject || !html) {
      logger.warn({ jobId: job.id, data: job.data }, 'org_smtp.retry.invalid_payload')
      return
    }

    await service.deliverRetryJob({
      organizationId,
      attempt,
      emailKind: data.emailKind === 'invitation' ? 'invitation' : 'generic',
      invitationId: typeof data.invitationId === 'string' ? data.invitationId : undefined,
      to,
      subject,
      html,
      text: typeof data.text === 'string' ? data.text : undefined,
    })
  }
}
