import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { META_INTERACTIVE_LIMITS } from '#lib/meta_whatsapp/interactive_message'
import type { FlowGraph } from '#lib/flow/flow_graph'
import { validateFlowGraph, validateFlowTrigger } from '#lib/flow/flow_graph_validator'

function codes(errors: Array<{ code: string }>): string[] {
  return errors.map((error) => error.code)
}

function validLinearGraph(): FlowGraph {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { label: 'Start' },
      },
      {
        id: 'message',
        type: 'MESSAGE',
        position: { x: 0, y: 80 },
        data: { label: 'Welcome', messageType: 'text', text: 'Hello' },
      },
      {
        id: 'buttons',
        type: 'INTERACTIVE_BUTTON',
        position: { x: 0, y: 160 },
        data: {
          label: 'Menu',
          bodyText: 'Pick one',
          buttons: [
            { id: 'btn_ok', title: 'OK' },
            { id: 'btn_stop', title: 'Stop', actionType: 'STOP' },
          ],
        },
      },
      {
        id: 'exit',
        type: 'EXIT',
        position: { x: 0, y: 240 },
        data: { label: 'Done' },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'message' },
      { id: 'e2', source: 'message', target: 'buttons' },
      { id: 'e3', source: 'buttons', sourceHandle: 'btn_ok', target: 'exit' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

test.group('flow graph validator', () => {
  test('accepts a valid linear trigger → message → buttons → exit graph', ({ assert }) => {
    const errors = validateFlowGraph(validLinearGraph())
    assert.deepEqual(errors, [])
  })

  test('rejects zero or multiple TRIGGER nodes', ({ assert }) => {
    const empty = validateFlowGraph({ nodes: [], edges: [] })
    assert.include(codes(empty), 'TRIGGER_COUNT')

    const two = validLinearGraph()
    two.nodes.push({
      id: 'trigger_2',
      type: 'TRIGGER',
      data: { label: 'Other' },
    })
    assert.include(codes(validateFlowGraph(two)), 'TRIGGER_COUNT')
  })

  test('rejects unreachable nodes', ({ assert }) => {
    const graph = validLinearGraph()
    graph.nodes.push({
      id: 'orphan',
      type: 'EXIT',
      data: { label: 'Orphan' },
    })
    assert.include(codes(validateFlowGraph(graph)), 'UNREACHABLE_NODE')
  })

  test('rejects missing interactive handle edges and undeclared handles', ({ assert }) => {
    const missing = validLinearGraph()
    missing.edges = missing.edges.filter((edge) => edge.id !== 'e3')
    assert.include(codes(validateFlowGraph(missing)), 'MISSING_HANDLE_EDGE')

    const undeclared = validLinearGraph()
    undeclared.edges.push({
      id: 'e4',
      source: 'buttons',
      sourceHandle: 'btn_unknown',
      target: 'exit',
    })
    assert.include(codes(validateFlowGraph(undeclared)), 'UNDECLARED_HANDLE')
  })

  test('rejects Meta interactive limit violations', ({ assert }) => {
    const tooManyButtons = validLinearGraph()
    const buttonsNode = tooManyButtons.nodes.find((node) => node.id === 'buttons')!
    buttonsNode.data.buttons = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' },
      { id: 'd', title: 'D' },
    ]
    assert.include(codes(validateFlowGraph(tooManyButtons)), 'META_LIMIT')

    const longTitle = validLinearGraph()
    const node = longTitle.nodes.find((n) => n.id === 'buttons')!
    node.data.buttons = [
      { id: 'btn_ok', title: 'x'.repeat(META_INTERACTIVE_LIMITS.buttonTitleMax + 1) },
    ]
    assert.include(codes(validateFlowGraph(longTitle)), 'META_LIMIT')
  })

  test('rejects self subflow and subflow cycles', ({ assert }) => {
    const flowId = randomUUID()
    const otherId = randomUUID()

    const selfGraph: FlowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: { label: 'Start' } },
        {
          id: 'sub',
          type: 'SUBFLOW',
          data: { label: 'Self', subflowId: flowId },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'sub' }],
    }
    assert.include(
      codes(validateFlowGraph(selfGraph, { flowId, publishedSubflows: new Map() })),
      'SUBFLOW_SELF'
    )

    const cyclic: FlowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: { label: 'Start' } },
        {
          id: 'sub',
          type: 'SUBFLOW',
          data: { label: 'Other', subflowId: otherId },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'sub' }],
    }
    const published = new Map<string, string[]>([[otherId, [flowId]]])
    assert.include(
      codes(validateFlowGraph(cyclic, { flowId, publishedSubflows: published })),
      'SUBFLOW_CYCLE'
    )
  })

  test('rejects KEYWORD triggers without keywords', ({ assert }) => {
    assert.include(codes(validateFlowTrigger('KEYWORD', {})), 'KEYWORD_REQUIRED')
    assert.deepEqual(validateFlowTrigger('KEYWORD', { keywords: ['hi'], matchType: 'exact' }), [])
    assert.deepEqual(validateFlowTrigger('INBOUND_ANY', {}), [])
  })

  test('requires condition handles and fallback edges', ({ assert }) => {
    const graph: FlowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: { label: 'Start' } },
        {
          id: 'cond',
          type: 'CONDITION',
          data: {
            label: 'Check',
            fallbackHandle: 'fallback',
            conditions: [
              {
                id: 'yes',
                variableKey: 'variables.ok',
                operator: 'equals',
                value: '1',
              },
            ],
          },
        },
        { id: 'exit', type: 'EXIT', data: { label: 'Done' } },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'cond' }],
    }
    const errors = validateFlowGraph(graph)
    assert.include(codes(errors), 'MISSING_HANDLE_EDGE')
  })
})
