import {
  DEFAULT_FLOW_VIEWPORT,
  parseFlowGraph,
  parseFlowSettings,
  parseTriggerConfig,
} from '#lib/flow/flow_graph'
import type {
  PlatformFlowCatalogRow,
  PlatformFlowCatalogVersionRow,
} from '#repositories/platform_flow_catalog_repository'

export type PlatformFlowCatalogSummary = {
  id: string
  slug: string
  name: string
  description: string | null
  status: string
  triggerType: string
  publishedVersionId: string | null
  requiredFeatureKeys: string[]
  extraRequiredFeatureKeys: string[]
  sortOrder: number
  createdAt: string
  updatedAt: string | null
}

export type PlatformFlowCatalogDetail = PlatformFlowCatalogSummary & {
  triggerConfig: ReturnType<typeof parseTriggerConfig>
  settings: ReturnType<typeof parseFlowSettings>
  createdByUserId: string | null
  version: {
    id: string
    versionNumber: number
    nodes: ReturnType<typeof parseFlowGraph>['nodes']
    edges: ReturnType<typeof parseFlowGraph>['edges']
    viewport: NonNullable<ReturnType<typeof parseFlowGraph>['viewport']>
    validationStatus: string
    validationErrors: PlatformFlowCatalogVersionRow['validationErrors']
    createdAt: string
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function transformPlatformFlowCatalogSummary(
  row: PlatformFlowCatalogRow
): PlatformFlowCatalogSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    triggerType: row.triggerType,
    publishedVersionId: row.publishedVersionId,
    requiredFeatureKeys: row.requiredFeatureKeys,
    extraRequiredFeatureKeys: row.extraRequiredFeatureKeys,
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt),
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
  }
}

export function transformPlatformFlowCatalogDetail(
  row: PlatformFlowCatalogRow,
  version: PlatformFlowCatalogVersionRow
): PlatformFlowCatalogDetail {
  const graph = parseFlowGraph({
    nodes: version.nodes,
    edges: version.edges,
    viewport: version.viewport,
  })

  return {
    ...transformPlatformFlowCatalogSummary(row),
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
