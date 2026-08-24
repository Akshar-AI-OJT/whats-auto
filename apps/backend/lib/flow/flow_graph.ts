import { FlowNodeType, FLOW_NODE_TYPES } from '#enums/flow_node_type'

export const FLOW_NAV_ACTIONS = ['DEFAULT', 'BACK', 'MAIN_MENU', 'STOP'] as const
export type FlowNavAction = (typeof FLOW_NAV_ACTIONS)[number]

export const FLOW_EXPIRY_MODES = ['RESUME_PROMPT', 'RESTART', 'RESUME_SILENT'] as const
export type FlowExpiryMode = (typeof FLOW_EXPIRY_MODES)[number]

export const FLOW_TANGENT_RESUME_MODES = ['IMMEDIATE_REPROMPT', 'WAIT_FOR_NEXT'] as const
export type FlowTangentResumeMode = (typeof FLOW_TANGENT_RESUME_MODES)[number]

export const FLOW_KEYWORD_MATCH_TYPES = ['exact', 'contains', 'regex'] as const
export type FlowKeywordMatchType = (typeof FLOW_KEYWORD_MATCH_TYPES)[number]

export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  sessionTtlMinutes: 1440,
  onExpiry: 'RESUME_PROMPT',
  tangentResume: 'IMMEDIATE_REPROMPT',
}

export type FlowSettings = {
  sessionTtlMinutes: number
  onExpiry: FlowExpiryMode
  tangentResume: FlowTangentResumeMode
}

export type FlowTriggerConfig = {
  keywords?: string[]
  matchType?: FlowKeywordMatchType
}

export type FlowViewport = {
  x: number
  y: number
  zoom: number
}

export const DEFAULT_FLOW_VIEWPORT: FlowViewport = { x: 0, y: 0, zoom: 1 }

export type FlowNode = {
  id: string
  type: string
  position?: { x: number; y: number }
  data: Record<string, unknown>
}

export type FlowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export type FlowGraph = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  viewport?: FlowViewport | null
}

export type FlowGraphValidationError = {
  code: string
  message: string
  nodeId?: string
  edgeId?: string
}

export function isFlowNodeType(value: string): value is FlowNodeType {
  return (FLOW_NODE_TYPES as string[]).includes(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function parseFlowGraph(input: {
  nodes?: unknown
  edges?: unknown
  viewport?: unknown
}): FlowGraph {
  return {
    nodes: parseNodes(input.nodes),
    edges: parseEdges(input.edges),
    viewport: parseViewport(input.viewport),
  }
}

export function parseFlowSettings(value: unknown): FlowSettings {
  const record = asRecord(value)
  const ttl = Number(record.sessionTtlMinutes)
  const onExpiry = asString(record.onExpiry)
  const tangentResume = asString(record.tangentResume)

  return {
    sessionTtlMinutes:
      Number.isInteger(ttl) && ttl >= 1 && ttl <= 10080
        ? ttl
        : DEFAULT_FLOW_SETTINGS.sessionTtlMinutes,
    onExpiry: FLOW_EXPIRY_MODES.includes(onExpiry as FlowExpiryMode)
      ? (onExpiry as FlowExpiryMode)
      : DEFAULT_FLOW_SETTINGS.onExpiry,
    tangentResume: FLOW_TANGENT_RESUME_MODES.includes(tangentResume as FlowTangentResumeMode)
      ? (tangentResume as FlowTangentResumeMode)
      : DEFAULT_FLOW_SETTINGS.tangentResume,
  }
}

export function parseTriggerConfig(value: unknown): FlowTriggerConfig {
  const record = asRecord(value)
  const keywords = Array.isArray(record.keywords)
    ? record.keywords.filter((item): item is string => typeof item === 'string')
    : undefined
  const matchType = asString(record.matchType)

  return {
    ...(keywords ? { keywords } : {}),
    ...(matchType && FLOW_KEYWORD_MATCH_TYPES.includes(matchType as FlowKeywordMatchType)
      ? { matchType: matchType as FlowKeywordMatchType }
      : {}),
  }
}

function parseNodes(value: unknown): FlowNode[] {
  const items = parseJsonArray(value)
  const nodes: FlowNode[] = []
  for (const item of items) {
    const record = asRecord(item)
    const id = typeof record.id === 'string' ? record.id : ''
    const type = typeof record.type === 'string' ? record.type : ''
    const position = isRecord(record.position)
      ? {
          x: Number(record.position.x) || 0,
          y: Number(record.position.y) || 0,
        }
      : undefined
    nodes.push({
      id,
      type,
      ...(position ? { position } : {}),
      data: asRecord(record.data),
    })
  }
  return nodes
}

function parseEdges(value: unknown): FlowEdge[] {
  const items = parseJsonArray(value)
  const edges: FlowEdge[] = []
  for (const item of items) {
    const record = asRecord(item)
    edges.push({
      id: typeof record.id === 'string' ? record.id : '',
      source: typeof record.source === 'string' ? record.source : '',
      target: typeof record.target === 'string' ? record.target : '',
      sourceHandle:
        typeof record.sourceHandle === 'string'
          ? record.sourceHandle
          : record.sourceHandle === null
            ? null
            : undefined,
      targetHandle:
        typeof record.targetHandle === 'string'
          ? record.targetHandle
          : record.targetHandle === null
            ? null
            : undefined,
    })
  }
  return edges
}

function parseViewport(value: unknown): FlowViewport {
  const record = asRecord(value)
  const x = Number(record.x)
  const y = Number(record.y)
  const zoom = Number(record.zoom)
  return {
    x: Number.isFinite(x) ? x : DEFAULT_FLOW_VIEWPORT.x,
    y: Number.isFinite(y) ? y : DEFAULT_FLOW_VIEWPORT.y,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : DEFAULT_FLOW_VIEWPORT.zoom,
  }
}

export function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function extractSubflowIds(graph: FlowGraph): string[] {
  const ids: string[] = []
  for (const node of graph.nodes) {
    if (node.type !== FlowNodeType.SUBFLOW) continue
    const subflowId = asString(node.data.subflowId)?.trim()
    if (subflowId) ids.push(subflowId)
  }
  return ids
}
