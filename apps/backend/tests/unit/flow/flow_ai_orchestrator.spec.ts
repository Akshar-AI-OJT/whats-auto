import { test } from '@japa/runner'
import { FlowNodeType } from '#enums/flow_node_type'
import { repromptTextFor } from '#services/flow/flow_ai_orchestrator'

test.group('flow AI orchestrator helpers', () => {
  test('repromptTextFor uses node copy', ({ assert }) => {
    assert.equal(
      repromptTextFor({
        id: 'ask',
        type: FlowNodeType.MESSAGE,
        data: { text: 'What is your order id?' },
      }),
      'What is your order id?'
    )
    assert.equal(
      repromptTextFor({
        id: 'menu',
        type: FlowNodeType.INTERACTIVE_BUTTON,
        data: { bodyText: 'Pick one' },
      }),
      'Pick one'
    )
  })
})
