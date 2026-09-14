import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import KnowledgeReindexService from '#services/ai/knowledge_reindex_service'

export function createAiReindexAllDocumentsHandler(
  reindex: KnowledgeReindexService = new KnowledgeReindexService()
): JobHandler {
  return async (job) => {
    logger.info({ jobId: job.id }, 'ai.reindex_all_documents.started')
    await reindex.run()
    logger.info({ jobId: job.id }, 'ai.reindex_all_documents.completed')
  }
}
