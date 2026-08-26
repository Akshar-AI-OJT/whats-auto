import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { Queue } from 'bullmq'
import { createRedisConnection } from '#lib/redis/create_redis_connection'
import BullmqJobQueueDriver from '#services/job_queue/drivers/bullmq_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'

async function redisAvailable(): Promise<boolean> {
  const client = createRedisConnection(REDIS_URL)
  client.options.connectTimeout = 2000
  client.options.maxRetriesPerRequest = 1
  client.options.retryStrategy = () => null
  try {
    await client.connect()
    await client.ping()
    await client.quit()
    return true
  } catch {
    try {
      client.disconnect()
    } catch {
      // ignore
    }
    return false
  }
}

const REDIS_OK = await redisAvailable()

async function waitForJobState(
  queue: Queue,
  jobId: string,
  expectedState: string,
  timeoutMs = 8000
): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const job = await queue.getJob(jobId)
    if (job && (await job.getState()) === expectedState) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Job ${jobId} did not reach state ${expectedState} within ${timeoutMs}ms`)
}

function createDriver(prefix: string): BullmqJobQueueDriver {
  return new BullmqJobQueueDriver({ redisUrl: REDIS_URL, prefix })
}

function createInspectQueue(jobName: string, prefix: string): Queue {
  return new Queue(jobName, {
    connection: createRedisConnection(REDIS_URL),
    prefix,
  })
}

test.group('BullmqJobQueueDriver singleton re-enqueue', () => {
  test('schedules a new delayed job after flows.advance_session completes', async ({ assert }) => {
    const prefix = `wa:test:flow-advance:${randomUUID()}`
    const driver = createDriver(prefix)
    const queue = createInspectQueue(JOB_NAMES.FLOWS_ADVANCE_SESSION, prefix)
    const conversationId = randomUUID()

    await driver.start()
    await driver.work(JOB_NAMES.FLOWS_ADVANCE_SESSION, async () => {})

    try {
      await driver.enqueue(
        JOB_NAMES.FLOWS_ADVANCE_SESSION,
        { pass: 1 },
        {
          singletonKey: conversationId,
          runAt: new Date(Date.now() + 50),
        }
      )

      await waitForJobState(queue, conversationId, 'completed')

      await driver.enqueue(
        JOB_NAMES.FLOWS_ADVANCE_SESSION,
        { pass: 2 },
        {
          singletonKey: conversationId,
          runAt: new Date(Date.now() + 60_000),
        }
      )

      const job = await queue.getJob(conversationId)
      assert.isNotNull(job)
      assert.equal(await job!.getState(), 'delayed')
      assert.deepEqual(job!.data, { pass: 2 })
    } finally {
      await queue.close()
      await driver.stop()
    }
  }).skip(!REDIS_OK, 'Redis is not available')

  test('schedules a new job after ai.summarize_conversation completes', async ({ assert }) => {
    const prefix = `wa:test:summarize:${randomUUID()}`
    const driver = createDriver(prefix)
    const queue = createInspectQueue(JOB_NAMES.AI_SUMMARIZE_CONVERSATION, prefix)
    const conversationId = randomUUID()

    await driver.start()
    await driver.work(JOB_NAMES.AI_SUMMARIZE_CONVERSATION, async () => {})

    try {
      await driver.enqueue(
        JOB_NAMES.AI_SUMMARIZE_CONVERSATION,
        { pass: 1 },
        { singletonKey: conversationId }
      )

      await waitForJobState(queue, conversationId, 'completed')

      await driver.enqueue(
        JOB_NAMES.AI_SUMMARIZE_CONVERSATION,
        { pass: 2 },
        { singletonKey: conversationId }
      )

      await waitForJobState(queue, conversationId, 'completed')

      const job = await queue.getJob(conversationId)
      assert.isNotNull(job)
      assert.equal(await job!.getState(), 'completed')
      assert.deepEqual(job!.data, { pass: 2 })
    } finally {
      await queue.close()
      await driver.stop()
    }
  }).skip(!REDIS_OK, 'Redis is not available')

  test('remove clears a completed singleton so enqueue can schedule again', async ({ assert }) => {
    const prefix = `wa:test:remove:${randomUUID()}`
    const driver = createDriver(prefix)
    const queue = createInspectQueue(JOB_NAMES.FLOWS_ADVANCE_SESSION, prefix)
    const conversationId = randomUUID()

    await driver.start()
    await driver.work(JOB_NAMES.FLOWS_ADVANCE_SESSION, async () => {})

    try {
      await driver.enqueue(
        JOB_NAMES.FLOWS_ADVANCE_SESSION,
        { pass: 1 },
        {
          singletonKey: conversationId,
          runAt: new Date(Date.now() + 50),
        }
      )

      await waitForJobState(queue, conversationId, 'completed')

      await driver.remove(JOB_NAMES.FLOWS_ADVANCE_SESSION, conversationId)

      await driver.enqueue(
        JOB_NAMES.FLOWS_ADVANCE_SESSION,
        { pass: 2 },
        {
          singletonKey: conversationId,
          runAt: new Date(Date.now() + 60_000),
        }
      )

      const job = await queue.getJob(conversationId)
      assert.isNotNull(job)
      assert.equal(await job!.getState(), 'delayed')
      assert.deepEqual(job!.data, { pass: 2 })
    } finally {
      await queue.close()
      await driver.stop()
    }
  }).skip(!REDIS_OK, 'Redis is not available')
})
