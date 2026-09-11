import { FlowNodeType } from '#enums/flow_node_type'
import type { FlowGraph } from '#lib/flow/flow_graph'

/**
 * Plan feature keys required to publish a graph. Shared by tenant publish
 * and platform flow catalog visibility so the mapping cannot drift.
 */
export function deriveRequiredFeatureKeys(graph: FlowGraph): string[] {
  const keys = new Set<string>(['flowBuilder'])
  const nodeTypes = new Set(graph.nodes.map((node) => node.type))
  if (
    nodeTypes.has(FlowNodeType.CONDITION) ||
    nodeTypes.has(FlowNodeType.SUBFLOW) ||
    nodeTypes.has(FlowNodeType.AI_RAG)
  ) {
    keys.add('flowAdvancedNodes')
  }
  if (nodeTypes.has(FlowNodeType.AI_RAG)) {
    keys.add('aiAutonomous')
  }
  return [...keys]
}

export function mergeRequiredFeatureKeys(derived: string[], extra: string[] = []): string[] {
  const keys = new Set(derived)
  for (const key of extra) {
    const trimmed = key.trim()
    if (trimmed) keys.add(trimmed)
  }
  return [...keys]
}

export function parseFeatureKeyList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0)
  }
  if (typeof value === 'string') {
    try {
      return parseFeatureKeyList(JSON.parse(value))
    } catch {
      return []
    }
  }
  return []
}
