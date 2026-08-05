import { test } from '@japa/runner'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { createWhatsappOutboundDispatchHandler } from '#services/job_queue/handlers/whatsapp_outbound_dispatch_handler'

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
    const { createWhatsappOutboundRecoveryHandler } = await import(
      '#services/job_queue/handlers/whatsapp_outbound_recovery_handler'
    )
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
