import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type InsertFlowExecutionLogParams = {
  organizationId: string
  flowSessionId: string
  conversationId: string
  nodeId: string
  nodeType: string
  actionTaken: string
  inputPayload?: Record<string, unknown> | null
  outputPayload?: Record<string, unknown> | null
  errorMessage?: string | null
}

type Db = typeof db | TransactionClientContract

/**
 * Tenant-scoped flow_execution_logs. Callers must run inside runWithTenant.
 */
export class FlowExecutionLogRepository {
  async insert(params: InsertFlowExecutionLogParams, client: Db = db): Promise<void> {
    await client.table('flow_execution_logs').insert({
      organizationId: params.organizationId,
      flowSessionId: params.flowSessionId,
      conversationId: params.conversationId,
      nodeId: params.nodeId,
      nodeType: params.nodeType,
      actionTaken: params.actionTaken,
      inputPayload: params.inputPayload ? JSON.stringify(params.inputPayload) : null,
      outputPayload: params.outputPayload ? JSON.stringify(params.outputPayload) : null,
      errorMessage: params.errorMessage ?? null,
    })
  }

  async deleteOlderThan(
    params: { organizationId: string; before: Date; limit: number },
    client: Db = db
  ): Promise<number> {
    const rows = await client
      .from('flow_execution_logs')
      .where('organizationId', params.organizationId)
      .where('createdAt', '<', params.before)
      .orderBy('createdAt', 'asc')
      .limit(params.limit)
      .select('id')
    const ids = (rows as Array<{ id: string }>).map((row) => row.id)
    if (ids.length === 0) return 0

    const deleted = await client.from('flow_execution_logs').whereIn('id', ids).delete()
    return Number(deleted)
  }
}
