import { test } from '@japa/runner'
import type { ApplicationService } from '@adonisjs/core/types'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import NullJobQueueDriver from '#services/job_queue/drivers/null_driver'
import BullmqJobQueueDriver from '#services/job_queue/drivers/bullmq_driver'

function fakeApp(values: Record<string, unknown>): ApplicationService {
  return {
    config: {
      get(key: string, fallback?: unknown) {
        return Object.hasOwn(values, key) ? values[key] : fallback
      },
    },
  } as ApplicationService
}

test.group('JobQueueManager', () => {
  test('creates the default null driver', ({ assert }) => {
    const manager = new JobQueueManager(fakeApp({ 'job_queue.default': 'null' }))
    assert.instanceOf(manager.use(), NullJobQueueDriver)
    assert.isUndefined(manager.aiDriverName())
  })

  test('creates a bullmq driver for the AI name', ({ assert }) => {
    const manager = new JobQueueManager(
      fakeApp({
        'job_queue.default': 'null',
        'job_queue.ai': 'bullmq',
        'job_queue.drivers.bullmq.redisUrl': 'redis://127.0.0.1:6379',
        'job_queue.drivers.bullmq.prefix': 'wa:test',
      })
    )

    assert.equal(manager.aiDriverName(), 'bullmq')
    assert.instanceOf(manager.use('bullmq'), BullmqJobQueueDriver)
  })

  test('treats ai driver null as unset', ({ assert }) => {
    const manager = new JobQueueManager(fakeApp({ 'job_queue.ai': 'null' }))
    assert.isUndefined(manager.aiDriverName())
  })

  test('rejects unknown driver names', ({ assert }) => {
    const manager = new JobQueueManager(fakeApp({}))
    assert.throws(() => manager.use('redis'), /Supported: pgboss, bullmq, null/)
  })
})
