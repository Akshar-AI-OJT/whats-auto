import { FlowNodeType } from '#enums/flow_node_type'
import { FlowTriggerType, FLOW_TRIGGER_TYPES } from '#enums/flow_trigger_type'
import { META_INTERACTIVE_LIMITS } from '#lib/meta_whatsapp/interactive_message'
import {
  asString,
  extractSubflowIds,
  FLOW_KEYWORD_MATCH_TYPES,
  FLOW_NAV_ACTIONS,
  isFlowNodeType,
  isRecord,
  type FlowEdge,
  type FlowGraph,
  type FlowGraphValidationError,
  type FlowNode,
  type FlowTriggerConfig,
} from '#lib/flow/flow_graph'
import { RAG_PROMPT_APPENDIX_MAX_LENGTH } from '#services/ai/ai_prompt_defaults'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'regex',
  'greater_than',
  'less_than',
  'has_tag',
] as const

export type ValidateFlowGraphOptions = {
  flowId?: string
  publishedSubflows?: Map<string, string[]>
}

export function validateFlowTrigger(
  triggerType: string,
  triggerConfig: FlowTriggerConfig
): FlowGraphValidationError[] {
  if (!(FLOW_TRIGGER_TYPES as string[]).includes(triggerType)) {
    return [{ code: 'INVALID_TRIGGER_TYPE', message: `Unknown trigger type ${triggerType}` }]
  }

  if (triggerType !== FlowTriggerType.KEYWORD) return []

  const keywords = (triggerConfig.keywords ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (keywords.length === 0) {
    return [
      {
        code: 'KEYWORD_REQUIRED',
        message: 'KEYWORD triggers require at least one keyword',
      },
    ]
  }

  const matchType = triggerConfig.matchType ?? 'exact'
  if (!FLOW_KEYWORD_MATCH_TYPES.includes(matchType)) {
    return [{ code: 'INVALID_MATCH_TYPE', message: `Unknown keyword match type ${matchType}` }]
  }

  return []
}

export function validateFlowGraph(
  graph: FlowGraph,
  options: ValidateFlowGraphOptions = {}
): FlowGraphValidationError[] {
  const errors: FlowGraphValidationError[] = []
  const nodeById = new Map<string, FlowNode>()
  const nodeIds = new Set<string>()

  for (const node of graph.nodes) {
    if (!node.id.trim()) {
      errors.push({ code: 'MISSING_NODE_ID', message: 'Every node must have an id' })
      continue
    }
    if (nodeIds.has(node.id)) {
      errors.push({
        code: 'DUPLICATE_NODE_ID',
        message: `Duplicate node id ${node.id}`,
        nodeId: node.id,
      })
      continue
    }
    nodeIds.add(node.id)
    nodeById.set(node.id, node)
    if (!isFlowNodeType(node.type)) {
      errors.push({
        code: 'UNKNOWN_NODE_TYPE',
        message: `Unknown node type ${node.type}`,
        nodeId: node.id,
      })
    }
  }

  const edgeIds = new Set<string>()
  const outgoing = new Map<string, FlowEdge[]>()
  for (const edge of graph.edges) {
    if (!edge.id.trim()) {
      errors.push({ code: 'MISSING_EDGE_ID', message: 'Every edge must have an id' })
      continue
    }
    if (edgeIds.has(edge.id)) {
      errors.push({
        code: 'DUPLICATE_EDGE_ID',
        message: `Duplicate edge id ${edge.id}`,
        edgeId: edge.id,
      })
      continue
    }
    edgeIds.add(edge.id)

    if (!nodeById.has(edge.source)) {
      errors.push({
        code: 'EDGE_UNKNOWN_SOURCE',
        message: `Edge ${edge.id} source ${edge.source} does not exist`,
        edgeId: edge.id,
      })
    }
    if (!nodeById.has(edge.target)) {
      errors.push({
        code: 'EDGE_UNKNOWN_TARGET',
        message: `Edge ${edge.id} target ${edge.target} does not exist`,
        edgeId: edge.id,
      })
    }

    const list = outgoing.get(edge.source) ?? []
    list.push(edge)
    outgoing.set(edge.source, list)
  }

  const triggers = graph.nodes.filter((node) => node.type === FlowNodeType.TRIGGER)
  if (triggers.length !== 1) {
    errors.push({
      code: 'TRIGGER_COUNT',
      message: 'Graph must contain exactly one TRIGGER node',
    })
  }

  const start = triggers[0]
  if (start) {
    const reachable = walkReachable(start.id, outgoing)
    for (const node of graph.nodes) {
      if (!node.id || !reachable.has(node.id)) {
        if (!node.id) continue
        errors.push({
          code: 'UNREACHABLE_NODE',
          message: `Node ${node.id} is not reachable from the trigger`,
          nodeId: node.id,
        })
      }
    }
  }

  for (const node of graph.nodes) {
    if (!node.id || !isFlowNodeType(node.type)) continue
    errors.push(...validateNode(node, outgoing.get(node.id) ?? [], options))
  }

  if (options.publishedSubflows && options.flowId) {
    errors.push(...validateSubflowCycles(options.flowId, graph, options.publishedSubflows))
  }

  return errors
}

function validateNode(
  node: FlowNode,
  edges: FlowEdge[],
  options: ValidateFlowGraphOptions
): FlowGraphValidationError[] {
  switch (node.type) {
    case FlowNodeType.TRIGGER:
      return validateUnlabeledOutgoing(node, edges, { min: 1, max: 1 })
    case FlowNodeType.MESSAGE:
      return validateMessageNode(node, edges)
    case FlowNodeType.TEMPLATE:
      return [
        ...requireString(node, 'messageTemplateId', 'TEMPLATE nodes require messageTemplateId'),
        ...validateUnlabeledOutgoing(node, edges, { min: 1, max: 1 }),
      ]
    case FlowNodeType.INTERACTIVE_BUTTON:
      return validateInteractiveButtonNode(node, edges)
    case FlowNodeType.INTERACTIVE_LIST:
      return validateInteractiveListNode(node, edges)
    case FlowNodeType.CONDITION:
      return validateConditionNode(node, edges)
    case FlowNodeType.SUBFLOW:
      return validateSubflowNode(node, edges, options)
    case FlowNodeType.AI_RAG:
      return validateAiRagNode(node, edges)
    case FlowNodeType.HUMAN_HANDOVER:
      return [
        ...requireString(node, 'reason', 'HUMAN_HANDOVER nodes require a reason'),
        ...validateUnlabeledOutgoing(node, edges, { min: 0, max: 0 }),
      ]
    case FlowNodeType.EXIT:
      return validateUnlabeledOutgoing(node, edges, { min: 0, max: 0 })
    default:
      return []
  }
}

function validateMessageNode(node: FlowNode, edges: FlowEdge[]): FlowGraphValidationError[] {
  const messageType = asString(node.data.messageType) ?? 'text'
  const errors: FlowGraphValidationError[] = []
  if (!['text', 'image', 'video', 'document'].includes(messageType)) {
    errors.push({
      code: 'INVALID_MESSAGE_TYPE',
      message: `Unknown message type ${messageType}`,
      nodeId: node.id,
    })
  }
  if (messageType === 'text' && !asString(node.data.text)?.trim()) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'Text MESSAGE nodes require text',
      nodeId: node.id,
    })
  }
  if (['image', 'video', 'document'].includes(messageType)) {
    const mediaAssetId = asString(node.data.mediaAssetId)?.trim()
    const mediaUrl = asString(node.data.mediaUrl)?.trim()
    if (!mediaAssetId && !mediaUrl) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: `${messageType} MESSAGE nodes require mediaAssetId or mediaUrl`,
        nodeId: node.id,
      })
    }
  }

  const waits = Boolean(node.data.waitForResponse)
  errors.push(...validateUnlabeledOutgoing(node, edges, { min: waits ? 0 : 1, max: 1 }))
  return errors
}

function validateInteractiveButtonNode(
  node: FlowNode,
  edges: FlowEdge[]
): FlowGraphValidationError[] {
  const errors: FlowGraphValidationError[] = []
  if (!asString(node.data.bodyText)?.trim()) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'INTERACTIVE_BUTTON nodes require bodyText',
      nodeId: node.id,
    })
  }

  const buttons = Array.isArray(node.data.buttons) ? node.data.buttons : []
  if (buttons.length < 1 || buttons.length > META_INTERACTIVE_LIMITS.maxButtons) {
    errors.push({
      code: 'META_LIMIT',
      message: `INTERACTIVE_BUTTON nodes must have 1–${META_INTERACTIVE_LIMITS.maxButtons} buttons`,
      nodeId: node.id,
    })
  }

  const handles: HandleSpec[] = []
  const seen = new Set<string>()
  for (const raw of buttons) {
    const button = isRecord(raw) ? raw : {}
    const id = asString(button.id)?.trim() ?? ''
    const title = asString(button.title)?.trim() ?? ''
    const actionType = asString(button.actionType) ?? 'DEFAULT'

    if (!id) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Each button must have an id',
        nodeId: node.id,
      })
      continue
    }
    if (seen.has(id)) {
      errors.push({
        code: 'DUPLICATE_HANDLE',
        message: `Duplicate button id ${id}`,
        nodeId: node.id,
      })
    }
    seen.add(id)

    if (!title) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: `Button ${id} requires a title`,
        nodeId: node.id,
      })
    } else if (title.length > META_INTERACTIVE_LIMITS.buttonTitleMax) {
      errors.push({
        code: 'META_LIMIT',
        message: `Button ${id} title exceeds ${META_INTERACTIVE_LIMITS.buttonTitleMax} characters`,
        nodeId: node.id,
      })
    }

    if (!FLOW_NAV_ACTIONS.includes(actionType as (typeof FLOW_NAV_ACTIONS)[number])) {
      errors.push({
        code: 'INVALID_ACTION_TYPE',
        message: `Button ${id} has unknown actionType ${actionType}`,
        nodeId: node.id,
      })
    }

    handles.push({
      id,
      requiresEdge: actionType === 'DEFAULT' || !button.actionType,
    })
  }

  errors.push(...validateDeclaredHandles(node, edges, handles))
  return errors
}

function validateInteractiveListNode(
  node: FlowNode,
  edges: FlowEdge[]
): FlowGraphValidationError[] {
  const errors: FlowGraphValidationError[] = []
  if (!asString(node.data.bodyText)?.trim()) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'INTERACTIVE_LIST nodes require bodyText',
      nodeId: node.id,
    })
  }

  const buttonTitle = asString(node.data.buttonTitle)?.trim() ?? ''
  if (!buttonTitle) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'INTERACTIVE_LIST nodes require buttonTitle',
      nodeId: node.id,
    })
  } else if (buttonTitle.length > META_INTERACTIVE_LIMITS.listButtonTitleMax) {
    errors.push({
      code: 'META_LIMIT',
      message: `List buttonTitle exceeds ${META_INTERACTIVE_LIMITS.listButtonTitleMax} characters`,
      nodeId: node.id,
    })
  }

  const sections = Array.isArray(node.data.sections) ? node.data.sections : []
  const handles: HandleSpec[] = []
  const seen = new Set<string>()
  let rowCount = 0

  for (const rawSection of sections) {
    const section = isRecord(rawSection) ? rawSection : {}
    const sectionTitle = asString(section.title)?.trim() ?? ''
    if (!sectionTitle) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Each list section requires a title',
        nodeId: node.id,
      })
    } else if (sectionTitle.length > META_INTERACTIVE_LIMITS.sectionTitleMax) {
      errors.push({
        code: 'META_LIMIT',
        message: `Section title exceeds ${META_INTERACTIVE_LIMITS.sectionTitleMax} characters`,
        nodeId: node.id,
      })
    }

    const rows = Array.isArray(section.rows) ? section.rows : []
    for (const rawRow of rows) {
      rowCount += 1
      const row = isRecord(rawRow) ? rawRow : {}
      const id = asString(row.id)?.trim() ?? ''
      const title = asString(row.title)?.trim() ?? ''
      const description = asString(row.description)
      const actionType = asString(row.actionType) ?? 'DEFAULT'

      if (!id) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Each list row must have an id',
          nodeId: node.id,
        })
        continue
      }
      if (seen.has(id)) {
        errors.push({
          code: 'DUPLICATE_HANDLE',
          message: `Duplicate list row id ${id}`,
          nodeId: node.id,
        })
      }
      seen.add(id)

      if (!title) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          message: `List row ${id} requires a title`,
          nodeId: node.id,
        })
      } else if (title.length > META_INTERACTIVE_LIMITS.rowTitleMax) {
        errors.push({
          code: 'META_LIMIT',
          message: `List row ${id} title exceeds ${META_INTERACTIVE_LIMITS.rowTitleMax} characters`,
          nodeId: node.id,
        })
      }

      if (description && description.length > META_INTERACTIVE_LIMITS.rowDescriptionMax) {
        errors.push({
          code: 'META_LIMIT',
          message: `List row ${id} description exceeds ${META_INTERACTIVE_LIMITS.rowDescriptionMax} characters`,
          nodeId: node.id,
        })
      }

      handles.push({
        id,
        requiresEdge: actionType === 'DEFAULT' || !row.actionType,
      })
    }
  }

  if (rowCount < 1 || rowCount > META_INTERACTIVE_LIMITS.maxListRows) {
    errors.push({
      code: 'META_LIMIT',
      message: `INTERACTIVE_LIST nodes must have 1–${META_INTERACTIVE_LIMITS.maxListRows} rows`,
      nodeId: node.id,
    })
  }

  errors.push(...validateDeclaredHandles(node, edges, handles))
  return errors
}

function validateConditionNode(node: FlowNode, edges: FlowEdge[]): FlowGraphValidationError[] {
  const errors: FlowGraphValidationError[] = []
  const fallbackHandle = asString(node.data.fallbackHandle)?.trim()
  if (!fallbackHandle) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'CONDITION nodes require fallbackHandle',
      nodeId: node.id,
    })
  }

  const conditions = Array.isArray(node.data.conditions) ? node.data.conditions : []
  if (conditions.length === 0) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'CONDITION nodes require at least one condition',
      nodeId: node.id,
    })
  }

  const handles: HandleSpec[] = []
  const seen = new Set<string>()
  if (fallbackHandle) {
    seen.add(fallbackHandle)
    handles.push({ id: fallbackHandle, requiresEdge: true })
  }

  for (const raw of conditions) {
    const condition = isRecord(raw) ? raw : {}
    const id = asString(condition.id)?.trim() ?? ''
    const operator = asString(condition.operator) ?? ''
    const variableKey = asString(condition.variableKey)?.trim() ?? ''
    if (!id) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Each condition must have an id',
        nodeId: node.id,
      })
      continue
    }
    if (seen.has(id)) {
      errors.push({
        code: 'DUPLICATE_HANDLE',
        message: `Duplicate condition handle ${id}`,
        nodeId: node.id,
      })
    }
    seen.add(id)
    if (!variableKey) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: `Condition ${id} requires variableKey`,
        nodeId: node.id,
      })
    }
    if (!CONDITION_OPERATORS.includes(operator as (typeof CONDITION_OPERATORS)[number])) {
      errors.push({
        code: 'INVALID_OPERATOR',
        message: `Condition ${id} has unknown operator ${operator}`,
        nodeId: node.id,
      })
    }
    handles.push({ id, requiresEdge: true })
  }

  errors.push(...validateDeclaredHandles(node, edges, handles))
  return errors
}

function validateSubflowNode(
  node: FlowNode,
  edges: FlowEdge[],
  options: ValidateFlowGraphOptions
): FlowGraphValidationError[] {
  const errors: FlowGraphValidationError[] = []
  const subflowId = asString(node.data.subflowId)?.trim()
  if (!subflowId || !UUID_RE.test(subflowId)) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      message: 'SUBFLOW nodes require a subflowId UUID',
      nodeId: node.id,
    })
  } else if (options.flowId && subflowId === options.flowId) {
    errors.push({
      code: 'SUBFLOW_SELF',
      message: 'A flow cannot call itself as a subflow',
      nodeId: node.id,
    })
  } else if (options.publishedSubflows && !options.publishedSubflows.has(subflowId)) {
    errors.push({
      code: 'SUBFLOW_NOT_PUBLISHED',
      message: `Subflow ${subflowId} is not a published flow in this organization`,
      nodeId: node.id,
    })
  }

  errors.push(...validateUnlabeledOutgoing(node, edges, { min: 0, max: 1 }))
  return errors
}

function validateAiRagNode(node: FlowNode, edges: FlowEdge[]): FlowGraphValidationError[] {
  const errors: FlowGraphValidationError[] = []
  const appendix = asString(node.data.promptAppendix)
  if (appendix && appendix.length > RAG_PROMPT_APPENDIX_MAX_LENGTH) {
    errors.push({
      code: 'META_LIMIT',
      message: `AI_RAG promptAppendix must be at most ${RAG_PROMPT_APPENDIX_MAX_LENGTH} characters`,
      nodeId: node.id,
    })
  }

  const fallbackAction = asString(node.data.fallbackAction) ?? 'HUMAN_HANDOVER'
  if (fallbackAction === 'ROUTE_EDGE') {
    const handle = asString(node.data.fallbackTargetHandle)?.trim()
    if (!handle) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'AI_RAG ROUTE_EDGE fallback requires fallbackTargetHandle',
        nodeId: node.id,
      })
      return errors
    }
    errors.push(...validateDeclaredHandles(node, edges, [{ id: handle, requiresEdge: true }]))
    return errors
  }
  errors.push(...validateUnlabeledOutgoing(node, edges, { min: 0, max: 1 }))
  return errors
}

type HandleSpec = { id: string; requiresEdge: boolean }

function validateDeclaredHandles(
  node: FlowNode,
  edges: FlowEdge[],
  handles: HandleSpec[]
): FlowGraphValidationError[] {
  const errors: FlowGraphValidationError[] = []
  const declared = new Set(handles.map((handle) => handle.id))
  const used = new Set<string>()

  for (const edge of edges) {
    const handle = edge.sourceHandle?.trim()
    if (!handle) {
      errors.push({
        code: 'UNDECLARED_HANDLE',
        message: `Edge ${edge.id} from ${node.id} is missing sourceHandle`,
        nodeId: node.id,
        edgeId: edge.id,
      })
      continue
    }
    if (!declared.has(handle)) {
      errors.push({
        code: 'UNDECLARED_HANDLE',
        message: `Edge ${edge.id} sourceHandle ${handle} is not declared on node ${node.id}`,
        nodeId: node.id,
        edgeId: edge.id,
      })
      continue
    }
    if (used.has(handle)) {
      errors.push({
        code: 'DUPLICATE_HANDLE_EDGE',
        message: `Handle ${handle} on node ${node.id} has more than one outgoing edge`,
        nodeId: node.id,
        edgeId: edge.id,
      })
    }
    used.add(handle)
  }

  for (const handle of handles) {
    if (handle.requiresEdge && !used.has(handle.id)) {
      errors.push({
        code: 'MISSING_HANDLE_EDGE',
        message: `Node ${node.id} is missing an edge for handle ${handle.id}`,
        nodeId: node.id,
      })
    }
  }

  return errors
}

function validateUnlabeledOutgoing(
  node: FlowNode,
  edges: FlowEdge[],
  bounds: { min: number; max: number }
): FlowGraphValidationError[] {
  const errors: FlowGraphValidationError[] = []
  for (const edge of edges) {
    if (edge.sourceHandle && edge.sourceHandle.trim()) {
      errors.push({
        code: 'UNDECLARED_HANDLE',
        message: `Node ${node.id} does not declare handle ${edge.sourceHandle}`,
        nodeId: node.id,
        edgeId: edge.id,
      })
    }
  }
  if (edges.length < bounds.min) {
    errors.push({
      code: 'MISSING_OUTGOING',
      message: `Node ${node.id} requires an outgoing edge`,
      nodeId: node.id,
    })
  }
  if (edges.length > bounds.max) {
    errors.push({
      code: 'TOO_MANY_OUTGOING',
      message: `Node ${node.id} has too many outgoing edges`,
      nodeId: node.id,
    })
  }
  return errors
}

function validateSubflowCycles(
  flowId: string,
  graph: FlowGraph,
  publishedSubflows: Map<string, string[]>
): FlowGraphValidationError[] {
  const adjacency = new Map(publishedSubflows)
  adjacency.set(flowId, extractSubflowIds(graph))

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  const visit = (id: string): boolean => {
    if (visiting.has(id)) {
      stack.push(id)
      return true
    }
    if (visited.has(id)) return false
    visiting.add(id)
    stack.push(id)
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true
    }
    stack.pop()
    visiting.delete(id)
    visited.add(id)
    return false
  }

  if (!visit(flowId)) return []

  return [
    {
      code: 'SUBFLOW_CYCLE',
      message: `Subflow cycle detected: ${stack.join(' → ')}`,
    },
  ]
}

function walkReachable(startId: string, outgoing: Map<string, FlowEdge[]>): Set<string> {
  const seen = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id || seen.has(id)) continue
    seen.add(id)
    for (const edge of outgoing.get(id) ?? []) {
      queue.push(edge.target)
    }
  }
  return seen
}

function requireString(node: FlowNode, field: string, message: string): FlowGraphValidationError[] {
  if (asString(node.data[field])?.trim()) return []
  return [{ code: 'MISSING_REQUIRED_FIELD', message, nodeId: node.id }]
}
