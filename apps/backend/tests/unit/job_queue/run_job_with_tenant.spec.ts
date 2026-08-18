import { test } from '@japa/runner'
import { getTenantOrganizationId } from '#services/tenant_context'
import { runJobWithTenant } from '#services/job_queue/run_job_with_tenant'

const ORG = '33333333-3333-3333-3333-333333333333'

test.group('runJobWithTenant', () => {
  test('binds organizationId from the job payload', async ({ assert }) => {
    let seen: string | undefined
    await runJobWithTenant({ organizationId: ORG }, async () => {
      seen = getTenantOrganizationId()
    })
    assert.equal(seen, ORG)
  })

  test('rejects payloads without organizationId', async ({ assert }) => {
    await assert.rejects(
      () => runJobWithTenant({}, async () => undefined),
      'Job payload missing organizationId'
    )
  })
})
