import { test } from '@japa/runner'
import { FlowNodeType } from '#enums/flow_node_type'
import { deriveRequiredFeatureKeys, mergeRequiredFeatureKeys } from '#lib/flow/flow_required_features'
import type { FlowGraph } from '#lib/flow/flow_graph'

function graph(types: string[]): FlowGraph {
  return {
    nodes: types.map((type, index) => ({
      id: `n${index}`,
      type,
      data: {},
    })),
    edges: [],
  }
}

test.group('deriveRequiredFeatureKeys', () => {
  test('basic graph requires flowBuilder only', ({ assert }) => {
    assert.deepEqual(
      deriveRequiredFeatureKeys(graph([FlowNodeType.MESSAGE, FlowNodeType.TEMPLATE])),
      ['flowBuilder']
    )
  })

  test('CONDITION adds flowAdvancedNodes', ({ assert }) => {
    assert.deepEqual(
      deriveRequiredFeatureKeys(graph([FlowNodeType.MESSAGE, FlowNodeType.CONDITION])).sort(),
      ['flowAdvancedNodes', 'flowBuilder']
    )
  })

  test('AI_RAG adds flowAdvancedNodes and aiAutonomous', ({ assert }) => {
    assert.deepEqual(
      deriveRequiredFeatureKeys(graph([FlowNodeType.AI_RAG])).sort(),
      ['aiAutonomous', 'flowAdvancedNodes', 'flowBuilder']
    )
  })

  test('extra keys union with derived and cannot drop them', ({ assert }) => {
    const derived = deriveRequiredFeatureKeys(graph([FlowNodeType.CONDITION]))
    const merged = mergeRequiredFeatureKeys(derived, ['apiAccess'])
    assert.includeMembers(merged, ['flowBuilder', 'flowAdvancedNodes', 'apiAccess'])
  })
})
