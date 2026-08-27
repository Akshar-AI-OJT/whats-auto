import { test } from '@japa/runner'
import type { FlowAdvanceSessionJobPayload } from '#services/flow/contracts/flow_job_payloads'
import { enqueueFlowAdvanceSession } from '#services/flow/enqueue_flow_advance'
import type JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'

const payload: FlowAdvanceSessionJobPayload = {
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  conversationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contactId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  messageId: 'msg-1',
  contentText: 'hi',
  interactiveReplyId: null,
  intent: { type: 'resume', sessionId: 'session-1' },
}

test.group('enqueueFlowAdvanceSession', () => {
  test('enqueues immediately when delaySeconds is omitted', async ({ assert }) => {
    const enqueued: Array<{ name: string; options?: { singletonKey?: string; runAt?: Date } }> = []
    const queue = {
      async ensureStarted() {
        return {
          async enqueue(
            name: string,
            _data: Record<string, unknown>,
            options?: { singletonKey?: string; runAt?: Date }
          ) {
            enqueued.push({ name, options })
          },
        }
      },
    } as unknown as JobQueueManager

    await enqueueFlowAdvanceSession(payload, { queue })

    assert.lengthOf(enqueued, 1)
    assert.equal(enqueued[0]?.name, JOB_NAMES.FLOWS_ADVANCE_SESSION)
    assert.equal(enqueued[0]?.options?.singletonKey, payload.conversationId)
    assert.isUndefined(enqueued[0]?.options?.runAt)
  })

  test('passes runAt when delaySeconds is set', async ({ assert }) => {
    const enqueued: Array<{ options?: { runAt?: Date } }> = []
    const queue = {
      async ensureStarted() {
        return {
          async enqueue(_name: string, _data: Record<string, unknown>, options?: { runAt?: Date }) {
            enqueued.push({ options })
          },
        }
      },
    } as unknown as JobQueueManager

    const before = Date.now()
    await enqueueFlowAdvanceSession(payload, { queue, delaySeconds: 4 })
    const runAt = enqueued[0]?.options?.runAt
    assert.isTrue(runAt instanceof Date)
    assert.isAtLeast(runAt!.getTime(), before + 3500)
  })
})
