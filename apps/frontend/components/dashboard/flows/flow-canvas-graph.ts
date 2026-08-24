import type {
  ConversationFlowGraphEdge,
  ConversationFlowGraphNode,
  ConversationFlowViewport,
} from '@/lib/api'
import type { Edge, Node } from '@xyflow/react'

export const FLOW_CANVAS_NODE_TYPES = [
  'TRIGGER',
  'MESSAGE',
  'TEMPLATE',
  'INTERACTIVE_BUTTON',
  'INTERACTIVE_LIST',
  'CONDITION',
  'SUBFLOW',
  'AI_RAG',
  'HUMAN_HANDOVER',
  'EXIT',
] as const

export type FlowCanvasNodeType = (typeof FLOW_CANVAS_NODE_TYPES)[number]

export const PALETTE_NODE_TYPES = FLOW_CANVAS_NODE_TYPES.filter(
  (type) => type !== 'TRIGGER'
) as Exclude<FlowCanvasNodeType, 'TRIGGER'>[]

export const FLOW_NAV_ACTIONS = ['DEFAULT', 'BACK', 'MAIN_MENU', 'STOP'] as const
export type FlowNavAction = (typeof FLOW_NAV_ACTIONS)[number]

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'regex',
  'greater_than',
  'less_than',
  'has_tag',
] as const

export const META_INTERACTIVE_LIMITS = {
  maxButtons: 3,
  buttonTitleMax: 20,
  maxListRows: 10,
  sectionTitleMax: 24,
  rowTitleMax: 24,
  rowDescriptionMax: 72,
  listButtonTitleMax: 20,
} as const

export const UNLABELED_SOURCE = 'out'
export const TARGET_HANDLE = 'in'

export const FLOW_DND_TYPE = 'application/x-whats-auto-flow-node'

export type FlowRfNode = Node<Record<string, unknown>, FlowCanvasNodeType>
export type FlowRfEdge = Edge

export type SourceHandleSpec = { id: string; label: string }

export function isFlowCanvasNodeType(value: string): value is FlowCanvasNodeType {
  return (FLOW_CANVAS_NODE_TYPES as readonly string[]).includes(value)
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function nodeLabel(data: Record<string, unknown>, fallback: string): string {
  const label = asString(data.label).trim()
  return label || fallback
}

export function newCanvasId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

export function defaultNodeData(type: FlowCanvasNodeType): Record<string, unknown> {
  switch (type) {
    case 'TRIGGER':
      return { label: 'Start' }
    case 'MESSAGE':
      return { label: 'Message', messageType: 'text', text: '', waitForResponse: false }
    case 'TEMPLATE':
      return { label: 'Template', messageTemplateId: '' }
    case 'INTERACTIVE_BUTTON':
      return {
        label: 'Buttons',
        bodyText: '',
        buttons: [{ id: 'btn_1', title: 'OK', actionType: 'DEFAULT' }],
      }
    case 'INTERACTIVE_LIST':
      return {
        label: 'List',
        bodyText: '',
        buttonTitle: 'Options',
        sections: [
          {
            title: 'Options',
            rows: [{ id: 'row_1', title: 'Option 1', actionType: 'DEFAULT' }],
          },
        ],
      }
    case 'CONDITION':
      return {
        label: 'Condition',
        fallbackHandle: 'else',
        conditions: [{ id: 'if_1', operator: 'equals', variableKey: 'variables.slot', value: '' }],
      }
    case 'SUBFLOW':
      return { label: 'Subflow', subflowId: '' }
    case 'AI_RAG':
      return { label: 'AI answer', fallbackAction: 'HUMAN_HANDOVER' }
    case 'HUMAN_HANDOVER':
      return { label: 'Handover', reason: 'human_handover' }
    case 'EXIT':
      return { label: 'Exit' }
  }
}

export function sourceHandlesForNode(
  type: string,
  data: Record<string, unknown>
): SourceHandleSpec[] {
  if (type === 'HUMAN_HANDOVER' || type === 'EXIT') return []

  if (type === 'INTERACTIVE_BUTTON') {
    const buttons = Array.isArray(data.buttons) ? data.buttons : []
    return buttons.map((raw, index) => {
      const button = asRecord(raw)
      const id = asString(button.id).trim() || `btn_${index + 1}`
      const title = asString(button.title).trim() || id
      return { id, label: title }
    })
  }

  if (type === 'INTERACTIVE_LIST') {
    const sections = Array.isArray(data.sections) ? data.sections : []
    const handles: SourceHandleSpec[] = []
    for (const rawSection of sections) {
      const section = asRecord(rawSection)
      const rows = Array.isArray(section.rows) ? section.rows : []
      for (const rawRow of rows) {
        const row = asRecord(rawRow)
        const id = asString(row.id).trim()
        if (!id) continue
        handles.push({ id, label: asString(row.title).trim() || id })
      }
    }
    return handles
  }

  if (type === 'CONDITION') {
    const conditions = Array.isArray(data.conditions) ? data.conditions : []
    const handles: SourceHandleSpec[] = conditions.map((raw, index) => {
      const condition = asRecord(raw)
      const id = asString(condition.id).trim() || `if_${index + 1}`
      return { id, label: id }
    })
    const fallback = asString(data.fallbackHandle).trim() || 'else'
    handles.push({ id: fallback, label: fallback })
    return handles
  }

  if (type === 'AI_RAG' && asString(data.fallbackAction) === 'ROUTE_EDGE') {
    const handle = asString(data.fallbackTargetHandle).trim()
    return handle ? [{ id: handle, label: handle }] : []
  }

  return [{ id: UNLABELED_SOURCE, label: '' }]
}

export function createFlowNode(
  type: FlowCanvasNodeType,
  position: { x: number; y: number }
): FlowRfNode {
  return {
    id: newCanvasId('n'),
    type,
    position,
    data: defaultNodeData(type),
  }
}

export function ensureTriggerNode(nodes: FlowRfNode[]): FlowRfNode[] {
  if (nodes.some((node) => node.type === 'TRIGGER')) return nodes
  return [
    {
      id: newCanvasId('n'),
      type: 'TRIGGER',
      position: { x: 80, y: 160 },
      data: defaultNodeData('TRIGGER'),
    },
    ...nodes,
  ]
}

export function graphToRf(input: {
  nodes?: ConversationFlowGraphNode[]
  edges?: ConversationFlowGraphEdge[]
}): { nodes: FlowRfNode[]; edges: FlowRfEdge[] } {
  const nodes = ensureTriggerNode(
    (input.nodes ?? []).map((node) => {
      const type = isFlowCanvasNodeType(node.type) ? node.type : 'MESSAGE'
      return {
        id: node.id,
        type,
        position: node.position ?? { x: 0, y: 0 },
        data: { ...defaultNodeData(type), ...asRecord(node.data) },
      } satisfies FlowRfNode
    })
  )

  const edges: FlowRfEdge[] = (input.edges ?? []).map((edge) => ({
    id: edge.id || newCanvasId('e'),
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle?.trim() ? edge.sourceHandle : UNLABELED_SOURCE,
    targetHandle: edge.targetHandle?.trim() ? edge.targetHandle : TARGET_HANDLE,
  }))

  return { nodes, edges }
}

export function rfToGraph(
  nodes: FlowRfNode[],
  edges: FlowRfEdge[],
  viewport: ConversationFlowViewport
): {
  nodes: ConversationFlowGraphNode[]
  edges: ConversationFlowGraphEdge[]
  viewport: ConversationFlowViewport
} {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type ?? 'MESSAGE',
      position: node.position,
      data: asRecord(node.data),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle:
        edge.sourceHandle && edge.sourceHandle !== UNLABELED_SOURCE ? edge.sourceHandle : null,
      targetHandle:
        edge.targetHandle && edge.targetHandle !== TARGET_HANDLE ? edge.targetHandle : null,
    })),
    viewport,
  }
}

export function remapSourceHandle(
  edges: FlowRfEdge[],
  nodeId: string,
  oldId: string,
  nextId: string
): FlowRfEdge[] {
  if (!oldId || oldId === nextId) return edges
  return edges.map((edge) =>
    edge.source === nodeId && edge.sourceHandle === oldId
      ? { ...edge, sourceHandle: nextId }
      : edge
  )
}

export function countListRows(data: Record<string, unknown>): number {
  const sections = Array.isArray(data.sections) ? data.sections : []
  let count = 0
  for (const raw of sections) {
    const section = asRecord(raw)
    count += Array.isArray(section.rows) ? section.rows.length : 0
  }
  return count
}

export const DEFAULT_VIEWPORT: ConversationFlowViewport = { x: 0, y: 0, zoom: 1 }

export const DEFAULT_FLOW_SETTINGS = {
  sessionTtlMinutes: 1440,
  onExpiry: 'RESUME_PROMPT' as const,
  tangentResume: 'IMMEDIATE_REPROMPT' as const,
}
