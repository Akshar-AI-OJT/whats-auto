import { test } from '@japa/runner'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { createContactImportHandler } from '#services/job_queue/handlers/contact_import_handler'

test.group('ContactImportHandler', () => {
  test('rejects invalid payloads without throwing', async ({ assert }) => {
    const handler = createContactImportHandler({
      processImport: async () => {
        assert.fail('should not process')
        return {} as never
      },
    } as any)

    await handler({
      id: 'job-1',
      name: JOB_NAMES.CONTACT_IMPORT,
      data: { organizationId: 123 },
    })
  })

  test('calls processImport with organization and import ids', async ({ assert }) => {
    const calls: unknown[] = []
    const handler = createContactImportHandler({
      processImport: async (params: unknown) => {
        calls.push(params)
        return {
          status: 'completed',
          processedRows: 2,
          successCount: 2,
          errorCount: 0,
        }
      },
    } as any)

    await handler({
      id: 'job-9',
      name: JOB_NAMES.CONTACT_IMPORT,
      data: { organizationId: 'org-1', importId: 'import-1' },
    })

    assert.deepEqual(calls[0], {
      organizationId: 'org-1',
      importId: 'import-1',
    })
  })
})
