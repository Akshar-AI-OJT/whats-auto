import { test } from '@japa/runner'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { FlowSessionStatus } from '#enums/flow_session_status'
import { type ConversationAiRepository } from '#repositories/conversation_ai_repository'
import { type FlowSessionRepository } from '#repositories/flow_session_repository'
import ConversationAiModeService from '#services/ai/conversation_ai_mode_service'
import type FlowInboundBufferService from '#services/flow/flow_inbound_buffer_service'
import type JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function createService(aiMode: string, options: { openSessionStatus?: string | null } = {}) {
  let mode = aiMode
  let reason: string | null = aiMode === ConversationAiMode.HANDOVER ? 'low_confidence' : null
  const paused: string[] = []
  const terminated: string[] = []
  const cancelledBuffers: string[] = []
  const removedJobs: Array<{ name: string; key: string }> = []
  const openSessionStatus = options.openSessionStatus ?? null

  const conversations = {
    async findById() {
      return {
        id: CONV,
        aiMode: mode,
        aiHandoverReason: reason,
        attributedCampaignId: null,
        contactId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }
    },
    async updateAiMode(params: { to: string; handoverReason: string | null }) {
      mode = params.to
      reason = params.handoverReason
      return true
    },
  } as unknown as ConversationAiRepository

  const sessions = {
    async pauseActiveForConversation(params: { conversationId: string }) {
      paused.push(params.conversationId)
      return 1
    },
    async terminatePausedForConversation(params: { conversationId: string }) {
      terminated.push(params.conversationId)
      return 1
    },
    async findOpenForConversation() {
      if (!openSessionStatus) return null
      return {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: openSessionStatus,
      }
    },
  } as unknown as FlowSessionRepository

  const inboundBuffer = {
    async cancel(params: { conversationId: string }) {
      cancelledBuffers.push(params.conversationId)
    },
  } as unknown as FlowInboundBufferService

  const queue = {
    async ensureStarted() {
      return {
        async remove(name: string, key: string) {
          removedJobs.push({ name, key })
        },
      }
    },
  } as unknown as JobQueueManager

  return {
    paused,
    terminated,
    cancelledBuffers,
    removedJobs,
    getMode: () => mode,
    service: new ConversationAiModeService(conversations, sessions, inboundBuffer, queue),
  }
}

test.group('ConversationAiModeService', () => {
  test('takeover moves AI_AUTO and HANDOVER to HUMAN_ACTIVE and pauses flow sessions', async ({
    assert,
  }) => {
    const auto = createService(ConversationAiMode.AI_AUTO)
    const taken = await auto.service.takeover({ organizationId: ORG, conversationId: CONV })
    assert.equal(taken.aiMode, ConversationAiMode.HUMAN_ACTIVE)
    assert.equal(taken.aiHandoverReason, 'takeover')
    assert.deepEqual(auto.paused, [CONV])
    assert.deepEqual(auto.cancelledBuffers, [CONV])
    assert.deepEqual(auto.removedJobs, [{ name: JOB_NAMES.FLOWS_ADVANCE_SESSION, key: CONV }])

    const fromHandover = createService(ConversationAiMode.HANDOVER)
    const after = await fromHandover.service.takeover({
      organizationId: ORG,
      conversationId: CONV,
    })
    assert.equal(after.aiMode, ConversationAiMode.HUMAN_ACTIVE)
  })

  test('resume restores AI_AUTO from HANDOVER or HUMAN_ACTIVE and terminates paused sessions', async ({
    assert,
  }) => {
    const human = createService(ConversationAiMode.HUMAN_ACTIVE)
    const resumed = await human.service.resume({ organizationId: ORG, conversationId: CONV })
    assert.equal(resumed.aiMode, ConversationAiMode.AI_AUTO)
    assert.isNull(resumed.aiHandoverReason)
    assert.deepEqual(human.terminated, [CONV])
    assert.deepEqual(human.cancelledBuffers, [CONV])

    const handover = createService(ConversationAiMode.HANDOVER)
    const fromHandover = await handover.service.resume({
      organizationId: ORG,
      conversationId: CONV,
    })
    assert.equal(fromHandover.aiMode, ConversationAiMode.AI_AUTO)
    assert.deepEqual(handover.terminated, [CONV])
  })

  test('takeover and resume are no-ops when already in the target mode', async ({ assert }) => {
    const human = createService(ConversationAiMode.HUMAN_ACTIVE)
    const again = await human.service.takeover({ organizationId: ORG, conversationId: CONV })
    assert.equal(again.aiMode, ConversationAiMode.HUMAN_ACTIVE)
    assert.deepEqual(human.paused, [CONV])

    const auto = createService(ConversationAiMode.AI_AUTO)
    const still = await auto.service.resume({ organizationId: ORG, conversationId: CONV })
    assert.equal(still.aiMode, ConversationAiMode.AI_AUTO)
    assert.deepEqual(auto.terminated, [CONV])
    assert.deepEqual(auto.cancelledBuffers, [CONV])
  })

  test('agent reply claims HUMAN_ACTIVE only when a live flow session is open', async ({
    assert,
  }) => {
    const midFlow = createService(ConversationAiMode.AI_AUTO, {
      openSessionStatus: FlowSessionStatus.WAITING_FOR_INPUT,
    })
    await midFlow.service.onAgentReply({ organizationId: ORG, conversationId: CONV })
    assert.equal(midFlow.getMode(), ConversationAiMode.HUMAN_ACTIVE)
    assert.deepEqual(midFlow.paused, [CONV])
    assert.deepEqual(midFlow.cancelledBuffers, [CONV])

    const idle = createService(ConversationAiMode.AI_AUTO)
    await idle.service.onAgentReply({ organizationId: ORG, conversationId: CONV })
    assert.equal(idle.getMode(), ConversationAiMode.AI_AUTO)
    assert.deepEqual(idle.paused, [])
    assert.deepEqual(idle.cancelledBuffers, [CONV])
  })

  test('agent reply after HANDOVER still claims HUMAN_ACTIVE', async ({ assert }) => {
    const handover = createService(ConversationAiMode.HANDOVER, {
      openSessionStatus: FlowSessionStatus.PAUSED_FOR_HUMAN,
    })
    await handover.service.onAgentReply({ organizationId: ORG, conversationId: CONV })
    assert.equal(handover.getMode(), ConversationAiMode.HUMAN_ACTIVE)
    assert.deepEqual(handover.paused, [CONV])
  })

  test('missing conversation throws not found', async ({ assert }) => {
    const conversations = {
      async findById() {
        return null
      },
    } as unknown as ConversationAiRepository
    const service = new ConversationAiModeService(conversations)

    await assert.rejects(
      () => service.takeover({ organizationId: ORG, conversationId: CONV }),
      /Conversation not found/
    )
  })
})
