import { test } from '@japa/runner'
import {
  evaluateFlowConditions,
  resolveConditionVariable,
} from '#services/flow/flow_condition_evaluator'

const context = {
  variables: { plan: 'vip', amount: '20' },
  contact: {
    name: 'Ada',
    phone: '1555',
    tagIds: ['tag-1'],
    tagNames: ['vip'],
  },
}

test.group('flow condition evaluator', () => {
  test('first matching condition wins; fallback is null', ({ assert }) => {
    assert.equal(
      evaluateFlowConditions(
        [
          { id: 'vip', variableKey: 'plan', operator: 'equals', value: 'vip' },
          { id: 'other', variableKey: 'plan', operator: 'equals', value: 'basic' },
        ],
        context
      ),
      'vip'
    )
    assert.isNull(
      evaluateFlowConditions(
        [{ id: 'miss', variableKey: 'plan', operator: 'equals', value: 'basic' }],
        context
      )
    )
  })

  test('supports the seven operators', ({ assert }) => {
    assert.equal(
      evaluateFlowConditions(
        [{ id: 'ok', variableKey: 'plan', operator: 'not_equals', value: 'basic' }],
        context
      ),
      'ok'
    )
    assert.equal(
      evaluateFlowConditions(
        [{ id: 'ok', variableKey: 'plan', operator: 'contains', value: 'vi' }],
        context
      ),
      'ok'
    )
    assert.equal(
      evaluateFlowConditions(
        [{ id: 'ok', variableKey: 'plan', operator: 'regex', value: '^vip$' }],
        context
      ),
      'ok'
    )
    assert.equal(
      evaluateFlowConditions(
        [{ id: 'ok', variableKey: 'amount', operator: 'greater_than', value: '10' }],
        context
      ),
      'ok'
    )
    assert.equal(
      evaluateFlowConditions(
        [{ id: 'ok', variableKey: 'amount', operator: 'less_than', value: '30' }],
        context
      ),
      'ok'
    )
    assert.equal(
      evaluateFlowConditions(
        [{ id: 'ok', variableKey: 'plan', operator: 'has_tag', value: 'vip' }],
        context
      ),
      'ok'
    )
  })

  test('resolves contact and variables prefixes', ({ assert }) => {
    assert.equal(resolveConditionVariable('contact.name', context), 'Ada')
    assert.equal(resolveConditionVariable('variables.plan', context), 'vip')
    assert.equal(resolveConditionVariable('plan', context), 'vip')
  })
})
