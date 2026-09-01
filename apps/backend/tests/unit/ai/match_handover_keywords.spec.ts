import { test } from '@japa/runner'
import { matchHandoverKeyword } from '#services/ai/match_handover_keywords'

test.group('matchHandoverKeyword', () => {
  test('returns the first case-insensitive substring match', ({ assert }) => {
    assert.equal(matchHandoverKeyword('Please talk to an agent now', ['hours', 'agent']), 'agent')
    assert.isNull(matchHandoverKeyword('What are your hours?', ['agent', 'human']))
    assert.isNull(matchHandoverKeyword('hello', ['', '  ']))
  })
})
