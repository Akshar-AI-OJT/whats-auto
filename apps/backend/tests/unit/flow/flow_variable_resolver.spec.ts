import { test } from '@japa/runner'
import { interpolateFlowText } from '#lib/flow/flow_variable_resolver'
import { matchesKeyword } from '#services/flow/flow_router_service'

test.group('flow variable resolver', () => {
  test('resolves contact and variables paths', ({ assert }) => {
    const text = interpolateFlowText('Hi {{contact.name}} — order {{variables.order_id}}', {
      contact: { name: 'Ada', phone: '1555' },
      variables: { order_id: '42' },
    })
    assert.equal(text, 'Hi Ada — order 42')
  })

  test('unresolved keys become empty strings', ({ assert }) => {
    const text = interpolateFlowText('X={{variables.missing}} Y={{contact.email}}', {
      contact: { name: 'Ada' },
      variables: {},
    })
    assert.equal(text, 'X= Y=')
  })
})

test.group('flow keyword matching', () => {
  test('supports exact, contains, and regex', ({ assert }) => {
    assert.isTrue(matchesKeyword('Hi', { keywords: ['hi'], matchType: 'exact' }))
    assert.isFalse(matchesKeyword('hi there', { keywords: ['hi'], matchType: 'exact' }))
    assert.isTrue(matchesKeyword('hi there', { keywords: ['hi'], matchType: 'contains' }))
    assert.isTrue(matchesKeyword('hello', { keywords: ['^hel'], matchType: 'regex' }))
  })
})
