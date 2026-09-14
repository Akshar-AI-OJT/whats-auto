import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { FlowSessionStatus } from '#enums/flow_session_status'
import { parseJsonArray } from '#lib/flow/flow_graph'

export type FlowSessionRow = {
  id: string
  organizationId: string
  conversationId: string
  contactId: string
  flowId: string
  flowVersionId: string
  currentNodeId: string
  status: string
  callStack: unknown[]
  variables: Record<string, unknown>
  lastInteractionAt: Date | string
  expiresAt: Date | string
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type InsertFlowSessionParams = {
  organizationId: string
  conversationId: string
  contactId: string
  flowId: string
  flowVersionId: string
  currentNodeId: string
  status?: string
  callStack?: unknown[]
  variables?: Record<string, unknown>
  expiresAt: Date
}

export type UpdateFlowSessionParams = {
  flowId?: string
  flowVersionId?: string
  currentNodeId?: string
  status?: string
  callStack?: unknown[]
  variables?: Record<string, unknown>
  lastInteractionAt?: Date
  expiresAt?: Date
}

type Db = typeof db | TransactionClientContract

const ACTIVE_STATUSES = [FlowSessionStatus.ACTIVE, FlowSessionStatus.WAITING_FOR_INPUT] as const

const OPEN_STATUSES = [
  FlowSessionStatus.ACTIVE,
  FlowSessionStatus.WAITING_FOR_INPUT,
  FlowSessionStatus.PAUSED_FOR_AI,
] as const

const BLOCKING_STATUSES = [...OPEN_STATUSES, FlowSessionStatus.PAUSED_FOR_HUMAN] as const

/**
 * Tenant-scoped flow_sessions. Callers must run inside runWithTenant.
 */
export class FlowSessionRepository {
  async findByIdForOrg(
    params: { organizationId: string; id: string },
    client: Db = db
  ): Promise<FlowSessionRow | null> {
    const row = await client
      .from('flow_sessions')
      .where('id', params.id)
      .where('organizationId', params.organizationId)
      .first()
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async findActiveForConversation(
    params: { organizationId: string; conversationId: string; now?: Date },
    client: Db = db
  ): Promise<FlowSessionRow | null> {
    const now = params.now ?? new Date()
    const row = await client
      .from('flow_sessions')
      .where('organizationId', params.organizationId)
      .where('conversationId', params.conversationId)
      .whereIn('status', [...ACTIVE_STATUSES])
      .where('expiresAt', '>', now)
      .orderBy('createdAt', 'desc')
      .first()
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async findOpenForConversation(
    params: { organizationId: string; conversationId: string },
    client: Db = db
  ): Promise<FlowSessionRow | null> {
    const row = await client
      .from('flow_sessions')
      .where('organizationId', params.organizationId)
      .where('conversationId', params.conversationId)
      .whereIn('status', [...BLOCKING_STATUSES])
      .orderBy('createdAt', 'desc')
      .first()
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async listExpired(
    params: { organizationId: string; now?: Date; limit: number },
    client: Db = db
  ): Promise<FlowSessionRow[]> {
    const now = params.now ?? new Date()
    const rows = await client
      .from('flow_sessions')
      .where('organizationId', params.organizationId)
      .whereIn('status', [...OPEN_STATUSES])
      .where('expiresAt', '<=', now)
      .orderBy('expiresAt', 'asc')
      .limit(params.limit)
    return (rows as Record<string, unknown>[]).map(mapRow)
  }

  async pauseActiveForConversation(
    params: { organizationId: string; conversationId: string },
    client: Db = db
  ): Promise<number> {
    const updated = await client
      .from('flow_sessions')
      .where('organizationId', params.organizationId)
      .where('conversationId', params.conversationId)
      .whereIn('status', [...OPEN_STATUSES])
      .update({
        status: FlowSessionStatus.PAUSED_FOR_HUMAN,
        updatedAt: new Date(),
      })
    return Number(updated)
  }

  async terminatePausedForConversation(
    params: { organizationId: string; conversationId: string },
    client: Db = db
  ): Promise<number> {
    const updated = await client
      .from('flow_sessions')
      .where('organizationId', params.organizationId)
      .where('conversationId', params.conversationId)
      .where('status', FlowSessionStatus.PAUSED_FOR_HUMAN)
      .update({
        status: FlowSessionStatus.TERMINATED,
        updatedAt: new Date(),
      })
    return Number(updated)
  }

  /**
   * Latest blocking session status per conversation (ACTIVE / WAITING / PAUSED_*).
   * Used for inbox automationBlocked / openFlowSessionStatus.
   */
  async mapBlockingStatusByConversationIds(
    params: { organizationId: string; conversationIds: string[] },
    client: Db = db
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    if (params.conversationIds.length === 0) return result

    const rows = await client
      .from('flow_sessions')
      .where('organizationId', params.organizationId)
      .whereIn('conversationId', params.conversationIds)
      .whereIn('status', [...BLOCKING_STATUSES])
      .select('conversationId', 'status', 'createdAt')
      .orderBy('createdAt', 'desc')

    for (const row of rows as Array<{ conversationId: string; status: string }>) {
      if (!result.has(row.conversationId)) {
        result.set(row.conversationId, row.status)
      }
    }
    return result
  }

  async insert(params: InsertFlowSessionParams, client: Db = db): Promise<FlowSessionRow> {
    const [row] = await client
      .table('flow_sessions')
      .insert({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        contactId: params.contactId,
        flowId: params.flowId,
        flowVersionId: params.flowVersionId,
        currentNodeId: params.currentNodeId,
        status: params.status ?? FlowSessionStatus.ACTIVE,
        callStack: jsonValue(params.callStack ?? []),
        variables: jsonValue(params.variables ?? {}),
        lastInteractionAt: new Date(),
        expiresAt: params.expiresAt,
      })
      .returning('*')

    return mapRow(row as Record<string, unknown>)
  }

  async update(
    params: { organizationId: string; id: string } & UpdateFlowSessionParams,
    client: Db = db
  ): Promise<FlowSessionRow | null> {
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (params.flowId !== undefined) patch.flowId = params.flowId
    if (params.flowVersionId !== undefined) patch.flowVersionId = params.flowVersionId
    if (params.currentNodeId !== undefined) patch.currentNodeId = params.currentNodeId
    if (params.status !== undefined) patch.status = params.status
    if (params.callStack !== undefined) patch.callStack = jsonValue(params.callStack)
    if (params.variables !== undefined) patch.variables = jsonValue(params.variables)
    if (params.lastInteractionAt !== undefined) {
      patch.lastInteractionAt = params.lastInteractionAt
    }
    if (params.expiresAt !== undefined) patch.expiresAt = params.expiresAt

    const [row] = await client
      .from('flow_sessions')
      .where('id', params.id)
      .where('organizationId', params.organizationId)
      .update(patch)
      .returning('*')

    return row ? mapRow(row as Record<string, unknown>) : null
  }
}

function mapRow(row: Record<string, unknown>): FlowSessionRow {
  const callStackRaw = row.callStack
  const callStack = Array.isArray(callStackRaw) ? callStackRaw : parseJsonArray(callStackRaw)

  const variablesRaw = row.variables
  let variables: Record<string, unknown> = {}
  if (variablesRaw && typeof variablesRaw === 'object' && !Array.isArray(variablesRaw)) {
    variables = variablesRaw as Record<string, unknown>
  } else if (typeof variablesRaw === 'string') {
    try {
      const parsed = JSON.parse(variablesRaw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        variables = parsed as Record<string, unknown>
      }
    } catch {
      variables = {}
    }
  }

  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    conversationId: String(row.conversationId),
    contactId: String(row.contactId),
    flowId: String(row.flowId),
    flowVersionId: String(row.flowVersionId),
    currentNodeId: String(row.currentNodeId),
    status: String(row.status),
    callStack,
    variables,
    lastInteractionAt: row.lastInteractionAt as Date | string,
    expiresAt: row.expiresAt as Date | string,
    createdAt: row.createdAt as Date | string,
    updatedAt: (row.updatedAt as Date | string | null) ?? null,
  }
}

function jsonValue(value: unknown): string {
  return JSON.stringify(value ?? null)
}
