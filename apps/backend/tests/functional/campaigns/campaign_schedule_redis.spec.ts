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
  timeoutMs = 10000
): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const job = await queue.getJob(jobId)
    if (job && (await job.getState()) === expectedState) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Job ${jobId} did not reach state ${expectedState} within ${timeoutMs}ms`)
}

test.group('Campaign schedule BullMQ Redis', () => {
  test('delayed campaigns.execute wake runs without an HTTP send', async ({ assert }) => {
    const prefix = `wa:test:campaign-sched:${randomUUID()}`
    const driver = new BullmqJobQueueDriver({ redisUrl: REDIS_URL, prefix })
    const queue = new Queue(JOB_NAMES.CAMPAIGN_EXECUTE, {
      connection: createRedisConnection(REDIS_URL),
      prefix,
    })
    const campaignId = randomUUID()
    const organizationId = randomUUID()
    let executed = 0

    await driver.start()
    await driver.work(JOB_NAMES.CAMPAIGN_EXECUTE, async (job) => {
      if (job.data.campaignId === campaignId && job.data.organizationId === organizationId) {
        executed += 1
      }
    })

    try {
      const runAt = new Date(Date.now() + 200)
      await driver.enqueue(
        JOB_NAMES.CAMPAIGN_EXECUTE,
        { organizationId, campaignId },
        { singletonKey: campaignId, runAt }
      )

      const delayed = await queue.getJob(campaignId)
      assert.isOk(delayed)
      assert.equal(await delayed!.getState(), 'delayed')

      await waitForJobState(queue, campaignId, 'completed')
      assert.equal(executed, 1)
    } finally {
      await driver.stop()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  }).skip(!REDIS_OK, 'Redis is not available')

  test('removing a delayed wake leaves recovery able to re-enqueue immediately', async ({
    assert,
  }) => {
    const prefix = `wa:test:campaign-rec:${randomUUID()}`
    const driver = new BullmqJobQueueDriver({ redisUrl: REDIS_URL, prefix })
    const queue = new Queue(JOB_NAMES.CAMPAIGN_EXECUTE, {
      connection: createRedisConnection(REDIS_URL),
      prefix,
    })
    const campaignId = randomUUID()
    const organizationId = randomUUID()
    let executed = 0

    await driver.start()
    await driver.work(JOB_NAMES.CAMPAIGN_EXECUTE, async (job) => {
      if (job.data.campaignId === campaignId) {
        executed += 1
      }
    })

    try {
      await driver.enqueue(
        JOB_NAMES.CAMPAIGN_EXECUTE,
        { organizationId, campaignId },
        { singletonKey: campaignId, runAt: new Date(Date.now() + 60_000) }
      )
      assert.equal(await (await queue.getJob(campaignId))!.getState(), 'delayed')

      await driver.remove(JOB_NAMES.CAMPAIGN_EXECUTE, campaignId)
      const removed = await queue.getJob(campaignId)
      assert.isTrue(!removed || (await removed.getState()) === 'unknown')

      // Recovery path: immediate wake (no runAt) after delayed job was lost.
      await driver.enqueue(
        JOB_NAMES.CAMPAIGN_EXECUTE,
        { organizationId, campaignId },
        { singletonKey: campaignId }
      )
      await waitForJobState(queue, campaignId, 'completed')
      assert.equal(executed, 1)
    } finally {
      await driver.stop()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  }).skip(!REDIS_OK, 'Redis is not available')
})
