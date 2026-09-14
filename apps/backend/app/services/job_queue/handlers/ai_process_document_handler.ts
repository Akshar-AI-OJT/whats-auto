import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import KnowledgeIngestService from '#services/ai/knowledge_ingest_service'
import { runJobWithTenant } from '#services/job_queue/run_job_with_tenant'

export function createAiProcessDocumentHandler(
  ingest: KnowledgeIngestService = new KnowledgeIngestService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : null
    const documentId = typeof job.data.documentId === 'string' ? job.data.documentId : null

    if (!organizationId || !documentId) {
      logger.warn({ jobId: job.id, data: job.data }, 'ai.process_document.invalid_payload')
      return
    }

    const result = await runJobWithTenant(job.data, () =>
      ingest.process({ organizationId, documentId })
    )

    logger.info(
      {
        jobId: job.id,
        organizationId,
        documentId,
        status: result.status,
        embedded: result.embedded,
        deleted: result.deleted,
        unchanged: result.unchanged,
        skipped: result.skipped,
      },
      'ai.process_document.completed'
    )
  }
}
