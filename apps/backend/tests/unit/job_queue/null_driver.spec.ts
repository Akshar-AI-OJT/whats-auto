import { test } from '@japa/runner'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { createWhatsappOutboundDispatchHandler } from '#services/job_queue/handlers/whatsapp_outbound_dispatch_handler'
import { createFlowsSessionRecoveryHandler } from '#services/job_queue/handlers/flows_session_recovery_handler'

test.group('NullJobQueueDriver', () => {
  test('enqueue records jobs without side effects', async ({ assert }) => {
    const driver = new NullJobQueueDriver()
    await driver.start()

    const id = await driver.enqueue(
      JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH,
      { organizationId: 'org-1', dispatchId: 'd-1' },
      { runAt: new Date('2026-01-01T00:01:00.000Z'), singletonKey: 'd-1' }
    )

    assert.isString(id)
    assert.lengthOf(driver.enqueued, 1)
    assert.equal(driver.enqueued[0].name, JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH)
    assert.equal(driver.enqueued[0].data.dispatchId, 'd-1')
    assert.equal(driver.enqueued[0].options?.singletonKey, 'd-1')

    await driver.stop()
    assert.isFalse(driver.started)
  })

  test('work registers handlers without polling', async ({ assert }) => {
    const driver = new NullJobQueueDriver()
    let called = false
    await driver.work(JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH, async () => {
      called = true
    })

    assert.isTrue(driver.handlers.has(JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH))
    assert.isFalse(called)
  })
})

test.group('scheduleWorkerCrons', () => {
  test('registers recovery crons for outbound, media, campaigns, billing, integrations, flows, and onboarding', async ({
    assert,
  }) => {
    const { scheduleWorkerCrons } = await import('#services/job_queue/schedule_worker_crons')
    const {
      BILLING_PAYMENT_WEBHOOK_RECOVERY_CRON,
      BILLING_SUBSCRIPTION_LIFECYCLE_CRON,
      CAMPAIGN_RECOVERY_CRON,
      FLOWS_SESSION_RECOVERY_CRON,
      INTEGRATION_EVENTS_RECOVERY_CRON,
      MEDIA_PENDING_UPLOAD_CLEANUP_CRON,
      MEDIA_STORAGE_LIFECYCLE_CRON,
      ONBOARDING_CLEANUP_CRON,
      WHATSAPP_OUTBOUND_RECOVERY_CRON,
    } = await import('#services/job_queue/job_names')
    const driver = new NullJobQueueDriver()
    const logs: string[] = []
    await scheduleWorkerCrons(driver, {
      info: (_payload, msg) => {
        logs.push(msg)
      },
    })

    assert.lengthOf(driver.scheduled, 9)
    assert.equal(driver.scheduled[0].name, JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY)
    assert.equal(driver.scheduled[0].cron, WHATSAPP_OUTBOUND_RECOVERY_CRON)
    assert.equal(driver.scheduled[0].options?.key, 'outbound-recovery')
    assert.equal(driver.scheduled[1].name, JOB_NAMES.MEDIA_PENDING_UPLOAD_CLEANUP)
    assert.equal(driver.scheduled[1].cron, MEDIA_PENDING_UPLOAD_CLEANUP_CRON)
    assert.equal(driver.scheduled[1].options?.key, 'media-pending-upload-cleanup')
    assert.equal(driver.scheduled[2].name, JOB_NAMES.MEDIA_STORAGE_LIFECYCLE)
    assert.equal(driver.scheduled[2].cron, MEDIA_STORAGE_LIFECYCLE_CRON)
    assert.equal(driver.scheduled[2].options?.key, 'media-storage-lifecycle')
    assert.equal(driver.scheduled[3].name, JOB_NAMES.CAMPAIGN_RECOVERY)
    assert.equal(driver.scheduled[3].cron, CAMPAIGN_RECOVERY_CRON)
    assert.equal(driver.scheduled[3].options?.key, 'campaign-recovery')
    assert.equal(driver.scheduled[4].name, JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS)
    assert.equal(driver.scheduled[4].cron, BILLING_PAYMENT_WEBHOOK_RECOVERY_CRON)
    assert.equal(driver.scheduled[4].options?.key, 'billing-webhook-recovery')
    assert.equal(driver.scheduled[5].name, JOB_NAMES.INTEGRATION_EVENTS_RECOVERY)
    assert.equal(driver.scheduled[5].cron, INTEGRATION_EVENTS_RECOVERY_CRON)
    assert.equal(driver.scheduled[5].options?.key, 'integration-events-recovery')
    assert.equal(driver.scheduled[6].name, JOB_NAMES.FLOWS_SESSION_RECOVERY)
    assert.equal(driver.scheduled[6].cron, FLOWS_SESSION_RECOVERY_CRON)
    assert.equal(driver.scheduled[6].options?.key, 'flows-session-recovery')
    assert.equal(driver.scheduled[7].name, JOB_NAMES.BILLING_SUBSCRIPTION_LIFECYCLE)
    assert.equal(driver.scheduled[7].cron, BILLING_SUBSCRIPTION_LIFECYCLE_CRON)
    assert.equal(driver.scheduled[7].options?.key, 'billing-subscription-lifecycle')
    assert.equal(driver.scheduled[8].name, JOB_NAMES.ONBOARDING_CLEANUP)
    assert.equal(driver.scheduled[8].cron, ONBOARDING_CLEANUP_CRON)
    assert.equal(driver.scheduled[8].options?.key, 'onboarding-cleanup')
    assert.deepEqual(logs, [
      'job_queue.outbound_recovery.scheduled',
      'job_queue.media_pending_upload_cleanup.scheduled',
      'job_queue.media_storage_lifecycle.scheduled',
      'job_queue.campaign_recovery.scheduled',
      'job_queue.billing_webhook_recovery.scheduled',
      'job_queue.integration_events_recovery.scheduled',
      'job_queue.flows_session_recovery.scheduled',
      'job_queue.billing_subscription_lifecycle.scheduled',
      'job_queue.onboarding_cleanup.scheduled',
    ])
  })
})

test.group('WhatsappOutboundDispatchHandler', () => {
  test('rejects invalid payloads without throwing', async ({ assert }) => {
    const handler = createWhatsappOutboundDispatchHandler({
      executeDispatch: async () => {
        assert.fail('should not execute')
        return { outcome: 'not_claimed', dispatchId: 'x' }
      },
    } as any)

    await handler({
      id: 'job-1',
      name: JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH,
      data: { organizationId: 123 },
    })
  })

  test('calls executeDispatch with job lock owner', async ({ assert }) => {
    const calls: unknown[] = []
    const handler = createWhatsappOutboundDispatchHandler({
      executeDispatch: async (params: unknown) => {
        calls.push(params)
        return {
          outcome: 'sent',
          dispatchId: 'd-1',
          messageId: 'm-1',
          providerMessageId: 'wamid.1',
        }
      },
    } as any)

    await handler({
      id: 'job-9',
      name: JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH,
      data: { organizationId: 'org-1', dispatchId: 'd-1' },
    })

    assert.deepEqual(calls[0], {
      organizationId: 'org-1',
      dispatchId: 'd-1',
      lockOwner: 'job:job-9',
    })
  })
})

test.group('WhatsappOutboundRecoveryHandler', () => {
  test('calls recoverStuckDispatches with optional org and limit', async ({ assert }) => {
    const calls: unknown[] = []
    const { createWhatsappOutboundRecoveryHandler } =
      await import('#services/job_queue/handlers/whatsapp_outbound_recovery_handler')
    const handler = createWhatsappOutboundRecoveryHandler({
      recoverStuckDispatches: async (params: unknown) => {
        calls.push(params)
        return { woken: 2, scannedOrganizations: 1 }
      },
    } as any)

    await handler({
      id: 'job-recovery',
      name: JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY,
      data: { organizationId: 'org-1', limit: 10 },
    })

    assert.deepEqual(calls[0], { organizationId: 'org-1', limit: 10 })
  })
})

test.group('FlowsSessionRecoveryHandler', () => {
  test('calls recoverExpiredSessions and purgeOldLogs', async ({ assert }) => {
    const calls: string[] = []
    const handler = createFlowsSessionRecoveryHandler({
      recoverExpiredSessions: async (params: unknown) => {
        calls.push(`expired:${JSON.stringify(params)}`)
        return { recovered: 1, scannedOrganizations: 1 }
      },
      purgeOldLogs: async (params: unknown) => {
        calls.push(`purge:${JSON.stringify(params)}`)
        return { deleted: 2, scannedOrganizations: 1 }
      },
    } as any)

    await handler({
      id: 'job-flow-recovery',
      name: JOB_NAMES.FLOWS_SESSION_RECOVERY,
      data: { organizationId: 'org-1', limit: 10 },
    })

    assert.deepEqual(calls, [
      'expired:{"organizationId":"org-1","limit":10}',
      'purge:{"organizationId":"org-1","limit":10}',
    ])
  })
})
