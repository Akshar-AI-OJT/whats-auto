import { test } from '@japa/runner'
import { createSmtpEmailRetryHandler } from '#services/job_queue/handlers/smtp_email_retry_handler'
import type { OrganizationSmtpService } from '#services/organization_smtp_service'

test.group('smtp email retry handler', () => {
  test('ignores invalid payloads', async ({ assert }) => {
    let called = false
    const service = {
      deliverRetryJob: async () => {
        called = true
      },
    } as unknown as OrganizationSmtpService

    const handler = createSmtpEmailRetryHandler(service)
    await handler({ id: 'job-1', name: 'smtp.email.retry', data: { attempt: 1 } })
    assert.isFalse(called)
  })

  test('delegates valid payloads to OrganizationSmtpService', async ({ assert }) => {
    const received: unknown[] = []
    const service = {
      deliverRetryJob: async (data: unknown) => {
        received.push(data)
      },
    } as unknown as OrganizationSmtpService

    const handler = createSmtpEmailRetryHandler(service)
    await handler({
      id: 'job-2',
      name: 'smtp.email.retry',
      data: {
        organizationId: 'org-1',
        attempt: 2,
        emailKind: 'invitation',
        invitationId: 'inv-1',
        to: 'a@example.com',
        subject: 'Invite',
        html: '<p>Hi</p>',
      },
    })

    assert.lengthOf(received, 1)
    assert.equal((received[0] as { attempt: number }).attempt, 2)
  })
})
