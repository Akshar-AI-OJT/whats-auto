import { test } from '@japa/runner'
import type { FlowAdvanceSessionJobPayload } from '#services/flow/contracts/flow_job_payloads'
import type FlowExecutionEngine from '#services/flow/flow_execution_engine'
import type FlowInboundBufferService from '#services/flow/flow_inbound_buffer_service'
import { createFlowsAdvanceSessionHandler } from '#services/job_queue/handlers/flows_advance_session_handler'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CONTACT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function basePayload(
  overrides: Partial<FlowAdvanceSessionJobPayload> = {}
): FlowAdvanceSessionJobPayload {
  return {
    organizationId: ORG,
    conversationId: CONV,
    contactId: CONTACT,
    messageId: 'msg-last',
    contentText: 'last',
    interactiveReplyId: null,
    intent: { type: 'resume', sessionId: 'session-1' },
    ...overrides,
  }
}

test.group('flows.advance_session handler buffer merge', () => {
  test('merges drained free-text lines into contentText', async ({ assert }) => {
    const advanced: FlowAdvanceSessionJobPayload[] = []
    const engine = {
      async advance(payload: FlowAdvanceSessionJobPayload) {
        advanced.push(payload)
        return { sessionId: 'session-1', status: 'WAITING_FOR_INPUT', steps: 1 }
      },
    } as unknown as FlowExecutionEngine

    const buffer = {
      async drain() {
        return [
          { messageId: 'm1', content: 'Hello', receivedAt: '2026-01-01T00:00:00.000Z' },
          { messageId: 'm2', content: 'Hours?', receivedAt: '2026-01-01T00:00:01.000Z' },
        ]
      },
    } as unknown as FlowInboundBufferService

    const handler = createFlowsAdvanceSessionHandler(engine, buffer)
    await handler({ id: '1', name: 'flows.advance_session', data: { ...basePayload() } })

    assert.lengthOf(advanced, 1)
    assert.equal(advanced[0]?.contentText, 'Hello\nHours?')
  })

  test('falls back to payload contentText when the buffer is empty', async ({ assert }) => {
    const advanced: FlowAdvanceSessionJobPayload[] = []
    const engine = {
      async advance(payload: FlowAdvanceSessionJobPayload) {
        advanced.push(payload)
        return { sessionId: 'session-1', status: 'WAITING_FOR_INPUT', steps: 1 }
      },
    } as unknown as FlowExecutionEngine

    const buffer = {
      async drain() {
        return []
      },
    } as unknown as FlowInboundBufferService

    const handler = createFlowsAdvanceSessionHandler(engine, buffer)
    await handler({
      id: '1',
      name: 'flows.advance_session',
      data: { ...basePayload({ contentText: 'solo' }) },
    })

    assert.equal(advanced[0]?.contentText, 'solo')
  })

  test('does not merge buffer into interactive replies', async ({ assert }) => {
    const advanced: FlowAdvanceSessionJobPayload[] = []
    let drained = false
    const engine = {
      async advance(payload: FlowAdvanceSessionJobPayload) {
        advanced.push(payload)
        return { sessionId: 'session-1', status: 'COMPLETED', steps: 1 }
      },
    } as unknown as FlowExecutionEngine

    const buffer = {
      async drain() {
        drained = true
        return [{ messageId: 'm1', content: 'stale', receivedAt: '2026-01-01T00:00:00.000Z' }]
      },
    } as unknown as FlowInboundBufferService

    const handler = createFlowsAdvanceSessionHandler(engine, buffer)
    await handler({
      id: '1',
      name: 'flows.advance_session',
      data: {
        ...basePayload({
          contentText: 'OK',
          interactiveReplyId: 'btn_ok',
        }),
      },
    })

    assert.isFalse(drained)
    assert.equal(advanced[0]?.contentText, 'OK')
    assert.equal(advanced[0]?.interactiveReplyId, 'btn_ok')
  })
})
