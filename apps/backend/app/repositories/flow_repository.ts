import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { FlowNodeType } from '#enums/flow_node_type'
import { FlowStatus } from '#enums/flow_status'
import { FlowValidationStatus } from '#enums/flow_validation_status'
import {
  asString,
  DEFAULT_FLOW_VIEWPORT,
  parseFlowGraph,
  parseJsonArray,
  type FlowGraph,
  type FlowGraphValidationError,
  type FlowSettings,
  type FlowTriggerConfig,
  type FlowViewport,
} from '#lib/flow/flow_graph'

export type FlowRow = {
  id: string
  organizationId: string
  name: string
  description: string | null
  status: string
  isDefault: boolean
  publishedVersionId: string | null
  triggerType: string
  triggerConfig: FlowTriggerConfig
  settings: FlowSettings
  createdByUserId: string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type FlowVersionRow = {
  id: string
  organizationId: string
  flowId: string
  versionNumber: number
  nodes: unknown
  edges: unknown
  viewport: FlowViewport | null
  validationStatus: string
  validationErrors: FlowGraphValidationError[]
  createdByUserId: string | null
  createdAt: Date | string
}

export type InsertFlowParams = {
  organizationId: string
  name: string
  description?: string | null
  status?: string
  isDefault?: boolean
  triggerType: string
  triggerConfig: FlowTriggerConfig
  settings: FlowSettings
  createdByUserId?: string | null
}

export type InsertFlowVersionParams = {
  organizationId: string
  flowId: string
  versionNumber: number
  graph: FlowGraph
  validationStatus: string
  validationErrors: FlowGraphValidationError[]
  createdByUserId?: string | null
}

export type UpdateFlowParams = {
  name?: string
  description?: string | null
  status?: string
  isDefault?: boolean
  publishedVersionId?: string | null
  triggerType?: string
  triggerConfig?: FlowTriggerConfig
  settings?: FlowSettings
  updatedAt?: Date
}

type Db = typeof db | TransactionClientContract

/**
 * Tenant-scoped flows + flow_versions. Callers must run inside runWithTenant.
 */
export class FlowRepository {
  async insertFlow(params: InsertFlowParams, client: Db = db): Promise<FlowRow> {
    const [row] = await client
      .table('flows')
      .insert({
        organizationId: params.organizationId,
        name: params.name,
        description: params.description ?? null,
        status: params.status ?? FlowStatus.DRAFT,
        isDefault: params.isDefault ?? false,
        triggerType: params.triggerType,
        triggerConfig: jsonValue(params.triggerConfig),
        settings: jsonValue(params.settings),
        createdByUserId: params.createdByUserId ?? null,
      })
      .returning('*')

    return mapFlowRow(row as Record<string, unknown>)
  }

  async insertVersion(params: InsertFlowVersionParams, client: Db = db): Promise<FlowVersionRow> {
    const [row] = await client
      .table('flow_versions')
      .insert({
        organizationId: params.organizationId,
        flowId: params.flowId,
        versionNumber: params.versionNumber,
        nodes: jsonValue(params.graph.nodes),
        edges: jsonValue(params.graph.edges),
        viewport: jsonValue(params.graph.viewport ?? DEFAULT_FLOW_VIEWPORT),
        validationStatus: params.validationStatus,
        validationErrors: jsonValue(params.validationErrors),
        createdByUserId: params.createdByUserId ?? null,
      })
      .returning('*')

    return mapVersionRow(row as Record<string, unknown>)
  }

  async findByIdForOrg(
    params: { organizationId: string; id: string },
    client: Db = db
  ): Promise<FlowRow | null> {
    const row = await client
      .from('flows')
      .where('id', params.id)
      .where('organizationId', params.organizationId)
      .first()
    return row ? mapFlowRow(row as Record<string, unknown>) : null
  }

  async findLatestVersion(
    params: { organizationId: string; flowId: string },
    client: Db = db
  ): Promise<FlowVersionRow | null> {
    const row = await client
      .from('flow_versions')
      .where('flowId', params.flowId)
      .where('organizationId', params.organizationId)
      .orderBy('versionNumber', 'desc')
      .first()
    return row ? mapVersionRow(row as Record<string, unknown>) : null
  }

  async findVersionById(
    params: { organizationId: string; id: string },
    client: Db = db
  ): Promise<FlowVersionRow | null> {
    const row = await client
      .from('flow_versions')
      .where('id', params.id)
      .where('organizationId', params.organizationId)
      .first()
    return row ? mapVersionRow(row as Record<string, unknown>) : null
  }

  async updateFlow(
    params: { organizationId: string; id: string } & UpdateFlowParams,
    client: Db = db
  ): Promise<FlowRow | null> {
    const patch: Record<string, unknown> = {
      updatedAt: params.updatedAt ?? new Date(),
    }
    if (params.name !== undefined) patch.name = params.name
    if (params.description !== undefined) patch.description = params.description
    if (params.status !== undefined) patch.status = params.status
    if (params.isDefault !== undefined) patch.isDefault = params.isDefault
    if (params.publishedVersionId !== undefined) {
      patch.publishedVersionId = params.publishedVersionId
    }
    if (params.triggerType !== undefined) patch.triggerType = params.triggerType
    if (params.triggerConfig !== undefined) patch.triggerConfig = jsonValue(params.triggerConfig)
    if (params.settings !== undefined) patch.settings = jsonValue(params.settings)

    const [row] = await client
      .from('flows')
      .where('id', params.id)
      .where('organizationId', params.organizationId)
      .update(patch)
      .returning('*')

    return row ? mapFlowRow(row as Record<string, unknown>) : null
  }

  async updateVersionGraph(
    params: {
      organizationId: string
      id: string
      graph: FlowGraph
      validationStatus: string
      validationErrors: FlowGraphValidationError[]
    },
    client: Db = db
  ): Promise<FlowVersionRow | null> {
    const [row] = await client
      .from('flow_versions')
      .where('id', params.id)
      .where('organizationId', params.organizationId)
      .update({
        nodes: jsonValue(params.graph.nodes),
        edges: jsonValue(params.graph.edges),
        viewport: jsonValue(params.graph.viewport ?? DEFAULT_FLOW_VIEWPORT),
        validationStatus: params.validationStatus,
        validationErrors: jsonValue(params.validationErrors),
      })
      .returning('*')

    return row ? mapVersionRow(row as Record<string, unknown>) : null
  }

  async clearDefaultExcept(
    params: { organizationId: string; exceptFlowId: string },
    client: Db = db
  ): Promise<void> {
    await client
      .from('flows')
      .where('organizationId', params.organizationId)
      .whereNot('id', params.exceptFlowId)
      .where('isDefault', true)
      .update({ isDefault: false, updatedAt: new Date() })
  }

  async listForOrg(params: {
    organizationId: string
    page: number
    perPage: number
    status?: string
    search?: string
  }): Promise<{ rows: FlowRow[]; total: number }> {
    const query = db.from('flows').where('organizationId', params.organizationId)

    if (params.status) {
      query.where('status', params.status)
    } else {
      query.whereNot('status', FlowStatus.ARCHIVED)
    }

    if (params.search) {
      query.whereILike('name', `%${params.search}%`)
    }

    const countResult = await query.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)
    const rows = await query
      .clone()
      .orderBy('updatedAt', 'desc')
      .orderBy('createdAt', 'desc')
      .offset((params.page - 1) * params.perPage)
      .limit(params.perPage)
      .select('*')

    return { rows: rows.map((row) => mapFlowRow(row as Record<string, unknown>)), total }
  }

  async listPublishedForOrg(organizationId: string, client: Db = db): Promise<FlowRow[]> {
    const rows = await client
      .from('flows')
      .where('organizationId', organizationId)
      .where('status', FlowStatus.PUBLISHED)
      .whereNotNull('publishedVersionId')
      .orderBy('isDefault', 'desc')
      .orderBy('updatedAt', 'desc')
      .select('*')

    return rows.map((row) => mapFlowRow(row as Record<string, unknown>))
  }

  async listPublishedSubflowTargets(
    organizationId: string,
    client: Db = db
  ): Promise<Map<string, string[]>> {
    const rows = await client
      .from('flows as f')
      .join('flow_versions as fv', 'fv.id', 'f.publishedVersionId')
      .where('f.organizationId', organizationId)
      .where('f.status', FlowStatus.PUBLISHED)
      .select('f.id as flowId', 'fv.nodes as nodes')

    const map = new Map<string, string[]>()
    for (const row of rows as Array<{ flowId: string; nodes: unknown }>) {
      const graph = parseFlowGraph({ nodes: row.nodes, edges: [] })
      const targets: string[] = []
      for (const node of graph.nodes) {
        if (node.type !== FlowNodeType.SUBFLOW) continue
        const subflowId = asString(node.data.subflowId)?.trim()
        if (subflowId) targets.push(subflowId)
      }
      map.set(String(row.flowId), targets)
    }
    return map
  }
}

function mapFlowRow(row: Record<string, unknown>): FlowRow {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    status: String(row.status),
    isDefault: Boolean(row.isDefault),
    publishedVersionId: (row.publishedVersionId as string | null) ?? null,
    triggerType: String(row.triggerType),
    triggerConfig: parseObject(row.triggerConfig),
    settings: parseObject(row.settings) as FlowSettings,
    createdByUserId: (row.createdByUserId as string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: (row.updatedAt as Date | string | null) ?? null,
  }
}

function mapVersionRow(row: Record<string, unknown>): FlowVersionRow {
  const errorsRaw = row.validationErrors
  const errors = Array.isArray(errorsRaw)
    ? (errorsRaw as FlowGraphValidationError[])
    : parseJsonArray(errorsRaw)

  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    flowId: String(row.flowId),
    versionNumber: Number(row.versionNumber),
    nodes: row.nodes,
    edges: row.edges,
    viewport: (row.viewport as FlowViewport | null) ?? DEFAULT_FLOW_VIEWPORT,
    validationStatus: String(row.validationStatus ?? FlowValidationStatus.VALID),
    validationErrors: errors as FlowGraphValidationError[],
    createdByUserId: (row.createdByUserId as string | null) ?? null,
    createdAt: row.createdAt as Date | string,
  }
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Knex maps JS arrays to Postgres array literals. jsonb columns need JSON text.
 */
function jsonValue(value: unknown): string {
  return JSON.stringify(value ?? null)
}
