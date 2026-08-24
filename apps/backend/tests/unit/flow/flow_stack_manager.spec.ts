import { test } from '@japa/runner'
import {
  MAX_FLOW_STACK_DEPTH,
  canPushFrame,
  ensureMenuFrame,
  frameTargetNodeId,
  parseCallStack,
  popBack,
  pushSubflowFrame,
  unwindToRoot,
  type FlowStackFrame,
} from '#services/flow/flow_stack_manager'

function frame(partial: Partial<FlowStackFrame> & Pick<FlowStackFrame, 'nodeId'>): FlowStackFrame {
  return {
    flowId: partial.flowId ?? 'flow-1',
    flowVersionId: partial.flowVersionId ?? 'ver-1',
    nodeId: partial.nodeId,
    menuNodeId: partial.menuNodeId ?? partial.nodeId,
    kind: partial.kind,
    variablesSnapshot: partial.variablesSnapshot ?? {},
    enteredAt: partial.enteredAt ?? '2026-08-24T00:00:00.000Z',
  }
}

test.group('flow stack manager', () => {
  test('ensureMenuFrame pushes distinct menus and skips duplicates', ({ assert }) => {
    const root = frame({ nodeId: 'menu' })
    const once = ensureMenuFrame([], root)
    assert.isNotNull(once)
    assert.lengthOf(once!, 1)

    const same = ensureMenuFrame(once!, frame({ nodeId: 'menu' }))
    assert.equal(same, once)

    const nested = ensureMenuFrame(once!, frame({ nodeId: 'submenu' }))
    assert.isNotNull(nested)
    assert.lengthOf(nested!, 2)
    assert.equal(frameTargetNodeId(nested![1]!), 'submenu')
  })

  test('popBack returns previous menu and never pops the root', ({ assert }) => {
    const stack = [
      frame({ nodeId: 'menu' }),
      frame({ nodeId: 'submenu' }),
      frame({ nodeId: 'leaf' }),
    ]
    const once = popBack(stack)
    assert.isNotNull(once)
    assert.lengthOf(once!.callStack, 2)
    assert.equal(once!.targetNodeId, 'submenu')
    assert.equal(once!.targetFlowId, 'flow-1')

    const twice = popBack(once!.callStack)
    assert.isNotNull(twice)
    assert.lengthOf(twice!.callStack, 1)
    assert.equal(twice!.targetNodeId, 'menu')

    assert.isNull(popBack(twice!.callStack))
    assert.isNull(popBack([]))
  })

  test('unwindToRoot keeps a single root frame', ({ assert }) => {
    const stack = [frame({ nodeId: 'menu' }), frame({ nodeId: 'submenu' })]
    const root = unwindToRoot(stack)
    assert.isNotNull(root)
    assert.lengthOf(root!.callStack, 1)
    assert.equal(root!.targetNodeId, 'menu')
    assert.isNull(unwindToRoot([]))
  })

  test('parseCallStack skips malformed frames', ({ assert }) => {
    const parsed = parseCallStack([
      {
        flowId: 'f',
        flowVersionId: 'v',
        nodeId: 'n',
        menuNodeId: 'n',
        variablesSnapshot: { a: 1 },
      },
      { flowId: 'f' },
      null,
    ])
    assert.lengthOf(parsed, 1)
    assert.equal(parsed[0]!.variablesSnapshot.a, 1)
  })

  test('pushSubflowFrame respects max depth', ({ assert }) => {
    let stack: FlowStackFrame[] = []
    for (let i = 0; i < MAX_FLOW_STACK_DEPTH; i += 1) {
      const next = pushSubflowFrame(stack, frame({ nodeId: `n${i}` }))
      assert.isNotNull(next)
      stack = next!
    }
    assert.isFalse(canPushFrame(stack))
    assert.isNull(pushSubflowFrame(stack, frame({ nodeId: 'overflow' })))
    assert.isNull(ensureMenuFrame(stack, frame({ nodeId: 'overflow-menu' })))
  })
})
