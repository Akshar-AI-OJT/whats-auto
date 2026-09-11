import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { CatalogStatus } from '#enums/catalog_status'
import { FlowValidationStatus } from '#enums/flow_validation_status'
import {
  DEFAULT_FLOW_VIEWPORT,
  parseFlowGraph,
  parseJsonArray,
  type FlowGraph,
  type FlowGraphValidationError,
  type FlowSettings,
  type FlowTriggerConfig,
  type FlowViewport,
} from '#lib/flow/flow_graph'
import { parseFeatureKeyList } from '#lib/flow/flow_required_features'

type DbClient = typeof db | TransactionClientContract

export type PlatformFlowCatalogRow = {
  id: string
  slug: string
  name: string
  description: string | null
  status: string
  publishedVersionId: string | null
  triggerType: string
  triggerConfig: FlowTriggerConfig
  settings: FlowSettings
  requiredFeatureKeys: string[]
  extraRequiredFeatureKeys: string[]
  sortOrder: number
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type PlatformFlowCatalogVersionRow = {
  id: string
  flowCatalogId: string
  versionNumber: number
  nodes: unknown
  edges: unknown
  viewport: FlowViewport | null
  validationStatus: string
  validationErrors: FlowGraphValidationError[]
  createdByUserId: string | null
  createdAt: Date | string
}

export type InsertPlatformFlowCatalogParams = {
  slug: string
  name: string
  description?: string | null
  status?: string
  triggerType: string
  triggerConfig: FlowTriggerConfig
  settings: FlowSettings
  requiredFeatureKeys?: string[]
  extraRequiredFeatureKeys?: string[]
  sortOrder?: number
  createdByUserId?: string | null
}

export type InsertPlatformFlowCatalogVersionParams = {
  flowCatalogId: string
  versionNumber: number
  graph: FlowGraph
  validationStatus: string
  validationErrors: FlowGraphValidationError[]
  createdByUserId?: string | null
}

export class PlatformFlowCatalogRepository {
  async findById(id: string, client: DbClient = db): Promise<PlatformFlowCatalogRow | null> {
    const row = await client.from('platform_flow_catalog').where('id', id).first()
    return row ? mapCatalogRow(row as Record<string, unknown>) : null
  }

  async findBySlug(slug: string, client: DbClient = db): Promise<PlatformFlowCatalogRow | null> {
    const row = await client.from('platform_flow_catalog').where('slug', slug).first()
    return row ? mapCatalogRow(row as Record<string, unknown>) : null
  }

  async list(filters: {
    page?: number
    perPage?: number
    search?: string
    status?: string
    publishedOnly?: boolean
  }, client: DbClient = db) {
    const page = filters.page ?? 1
    const perPage = filters.perPage ?? 20
    let query = client.from('platform_flow_catalog')

    if (filters.publishedOnly) {
      query = query.where('status', CatalogStatus.PUBLISHED)
    } else if (filters.status) {
      query = query.where('status', filters.status)
    }

    if (filters.search) {
      const term = `%${filters.search}%`
      query = query.where((q) => {
        q.whereILike('name', term).orWhereILike('slug', term)
      })
    }

    const countResult = await query.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)
    const rows = await query
      .orderBy('sortOrder', 'asc')
      .orderBy('name', 'asc')
      .offset((page - 1) * perPage)
      .limit(perPage)

    return {
      rows: (rows as Record<string, unknown>[]).map(mapCatalogRow),
      total,
      page,
      perPage,
      lastPage: Math.ceil(total / perPage) || 1,
    }
  }

  async listPublished(client: DbClient = db): Promise<PlatformFlowCatalogRow[]> {
    const rows = await client
      .from('platform_flow_catalog')
      .where('status', CatalogStatus.PUBLISHED)
      .orderBy('sortOrder', 'asc')
      .orderBy('name', 'asc')
    return (rows as Record<string, unknown>[]).map(mapCatalogRow)
  }

  async insert(
    params: InsertPlatformFlowCatalogParams,
    client: DbClient = db
  ): Promise<PlatformFlowCatalogRow> {
    const [row] = await client
      .table('platform_flow_catalog')
      .insert({
        slug: params.slug,
        name: params.name,
        description: params.description ?? null,
        status: params.status ?? CatalogStatus.DRAFT,
        triggerType: params.triggerType,
        triggerConfig: jsonValue(params.triggerConfig),
        settings: jsonValue(params.settings),
        requiredFeatureKeys: jsonValue(params.requiredFeatureKeys ?? ['flowBuilder']),
        extraRequiredFeatureKeys: jsonValue(params.extraRequiredFeatureKeys ?? []),
        sortOrder: params.sortOrder ?? 0,
        createdByUserId: params.createdByUserId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*')
    return mapCatalogRow(row as Record<string, unknown>)
  }

  async update(
    id: string,
    patch: Record<string, unknown>,
    client: DbClient = db
  ): Promise<PlatformFlowCatalogRow | null> {
    const payload: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    for (const key of [
      'triggerConfig',
      'settings',
      'requiredFeatureKeys',
      'extraRequiredFeatureKeys',
    ] as const) {
      if (key in payload && payload[key] !== null && typeof payload[key] !== 'string') {
        payload[key] = jsonValue(payload[key])
      }
    }
    const [row] = await client.from('platform_flow_catalog').where('id', id).update(payload).returning('*')
    return row ? mapCatalogRow(row as Record<string, unknown>) : null
  }

  async findLatestVersion(
    flowCatalogId: string,
    client: DbClient = db
  ): Promise<PlatformFlowCatalogVersionRow | null> {
    const row = await client
      .from('platform_flow_catalog_versions')
      .where('flowCatalogId', flowCatalogId)
      .orderBy('versionNumber', 'desc')
      .first()
    return row ? mapVersionRow(row as Record<string, unknown>) : null
  }

  async findVersionById(
    id: string,
    client: DbClient = db
  ): Promise<PlatformFlowCatalogVersionRow | null> {
    const row = await client.from('platform_flow_catalog_versions').where('id', id).first()
    return row ? mapVersionRow(row as Record<string, unknown>) : null
  }

  async insertVersion(
    params: InsertPlatformFlowCatalogVersionParams,
    client: DbClient = db
  ): Promise<PlatformFlowCatalogVersionRow> {
    const [row] = await client
      .table('platform_flow_catalog_versions')
      .insert({
        flowCatalogId: params.flowCatalogId,
        versionNumber: params.versionNumber,
        nodes: jsonValue(params.graph.nodes),
        edges: jsonValue(params.graph.edges),
        viewport: jsonValue(params.graph.viewport ?? DEFAULT_FLOW_VIEWPORT),
        validationStatus: params.validationStatus,
        validationErrors: jsonValue(params.validationErrors),
        createdByUserId: params.createdByUserId ?? null,
        createdAt: new Date(),
      })
      .returning('*')
    return mapVersionRow(row as Record<string, unknown>)
  }

  async updateVersionGraph(
    params: {
      id: string
      graph: FlowGraph
      validationStatus: string
      validationErrors: FlowGraphValidationError[]
    },
    client: DbClient = db
  ): Promise<PlatformFlowCatalogVersionRow | null> {
    const [row] = await client
      .from('platform_flow_catalog_versions')
      .where('id', params.id)
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

  async listPublishedSubflowTargets(client: DbClient = db): Promise<Map<string, string[]>> {
    const rows = await client
      .from('platform_flow_catalog')
      .where('status', CatalogStatus.PUBLISHED)
      .whereNotNull('publishedVersionId')
      .select('id', 'publishedVersionId')

    const map = new Map<string, string[]>()
    for (const row of rows as Array<{ id: string; publishedVersionId: string }>) {
      const version = await this.findVersionById(row.publishedVersionId, client)
      if (!version) {
        map.set(row.id, [])
        continue
      }
      const graph = parseFlowGraph({
        nodes: version.nodes,
        edges: version.edges,
        viewport: version.viewport,
      })
      map.set(
        row.id,
        graph.nodes
          .filter((node) => node.type === 'SUBFLOW')
          .map((node) => String(node.data.subflowId ?? '').trim())
          .filter(Boolean)
      )
    }
    return map
  }
}

function mapCatalogRow(row: Record<string, unknown>): PlatformFlowCatalogRow {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    status: String(row.status),
    publishedVersionId: (row.publishedVersionId as string | null) ?? null,
    triggerType: String(row.triggerType),
    triggerConfig: parseObject(row.triggerConfig) as FlowTriggerConfig,
    settings: parseObject(row.settings) as FlowSettings,
    requiredFeatureKeys: parseFeatureKeyList(row.requiredFeatureKeys),
    extraRequiredFeatureKeys: parseFeatureKeyList(row.extraRequiredFeatureKeys),
    sortOrder: Number(row.sortOrder ?? 0),
    createdByUserId: (row.createdByUserId as string | null) ?? null,
    updatedByUserId: (row.updatedByUserId as string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: (row.updatedAt as Date | string | null) ?? null,
  }
}

function mapVersionRow(row: Record<string, unknown>): PlatformFlowCatalogVersionRow {
  const errorsRaw = row.validationErrors
  const errors = Array.isArray(errorsRaw)
    ? (errorsRaw as FlowGraphValidationError[])
    : parseJsonArray(errorsRaw)

  return {
    id: String(row.id),
    flowCatalogId: String(row.flowCatalogId),
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

function jsonValue(value: unknown): string {
  return JSON.stringify(value ?? null)
}
