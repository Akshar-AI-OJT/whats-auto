import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import { ContactImportService } from '#services/contact_import_service'

export type ContactImportJobData = {
  organizationId: string
  importId: string
}

export function createContactImportHandler(
  imports: ContactImportService = new ContactImportService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : null
    const importId = typeof job.data.importId === 'string' ? job.data.importId : null

    if (!organizationId || !importId) {
      logger.warn({ jobId: job.id, data: job.data }, 'contact.import.invalid_payload')
      return
    }

    const result = await imports.processImport({ organizationId, importId })

    logger.info(
      {
        jobId: job.id,
        organizationId,
        importId,
        status: result.status,
        processedRows: result.processedRows,
        successCount: result.successCount,
        errorCount: result.errorCount,
      },
      'contact.import.completed'
    )
  }
}
