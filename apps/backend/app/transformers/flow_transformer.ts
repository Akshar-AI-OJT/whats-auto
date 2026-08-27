import type { FlowRow, FlowVersionRow } from '#repositories/flow_repository'
import {
  DEFAULT_FLOW_VIEWPORT,
  parseFlowGraph,
  parseFlowSettings,
  parseTriggerConfig,
} from '#lib/flow/flow_graph'

export type FlowSummaryResponse = {
  id: string
  organizationId: string
  name: string
  description: string | null
  status: string
  isDefault: boolean
  triggerType: string
  publishedVersionId: string | null
  createdAt: string
  updatedAt: string | null
}

export type FlowVersionResponse = {
  id: string
  versionNumber: number
  nodes: ReturnType<typeof parseFlowGraph>['nodes']
  edges: ReturnType<typeof parseFlowGraph>['edges']
  viewport: NonNullable<ReturnType<typeof parseFlowGraph>['viewport']>
  validationStatus: string
  validationErrors: FlowVersionRow['validationErrors']
  createdAt: string
}

export type FlowDetailResponse = FlowSummaryResponse & {
  triggerConfig: ReturnType<typeof parseTriggerConfig>
  settings: ReturnType<typeof parseFlowSettings>
  createdByUserId: string | null
  version: FlowVersionResponse
}

export function transformFlowSummary(row: FlowRow): FlowSummaryResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    status: row.status,
    isDefault: row.isDefault,
    triggerType: row.triggerType,
    publishedVersionId: row.publishedVersionId,
    createdAt: toIso(row.createdAt),
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
  }
}

export function transformFlowDetail(row: FlowRow, version: FlowVersionRow): FlowDetailResponse {
  const graph = parseFlowGraph({
    nodes: version.nodes,
    edges: version.edges,
    viewport: version.viewport,
  })

  return {
    ...transformFlowSummary(row),
    triggerConfig: parseTriggerConfig(row.triggerConfig),
    settings: parseFlowSettings(row.settings),
    createdByUserId: row.createdByUserId,
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      nodes: graph.nodes,
      edges: graph.edges,
      viewport: graph.viewport ?? DEFAULT_FLOW_VIEWPORT,
      validationStatus: version.validationStatus,
      validationErrors: version.validationErrors,
      createdAt: toIso(version.createdAt),
    },
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
