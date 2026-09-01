import { test } from '@japa/runner'
import { mapBullmqEnqueueOptions } from '#services/job_queue/drivers/bullmq_enqueue_options'

test.group('mapBullmqEnqueueOptions', () => {
  test('maps delay from runAt and jobId from singletonKey', ({ assert }) => {
    const now = Date.parse('2026-08-11T10:00:00.000Z')
    const mapped = mapBullmqEnqueueOptions(
      {
        runAt: new Date('2026-08-11T10:00:04.000Z'),
        singletonKey: 'org:conv',
      },
      now
    )

    assert.equal(mapped.attempts, 1)
    assert.equal(mapped.delay, 4000)
    assert.equal(mapped.jobId, 'org:conv')
  })

  test('clamps past runAt to zero delay', ({ assert }) => {
    const now = Date.parse('2026-08-11T10:00:00.000Z')
    const mapped = mapBullmqEnqueueOptions({ runAt: new Date('2026-08-11T09:59:50.000Z') }, now)
    assert.equal(mapped.delay, 0)
    assert.isUndefined(mapped.jobId)
  })
})
