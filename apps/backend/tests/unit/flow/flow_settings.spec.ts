import { test } from '@japa/runner'
import { DEFAULT_FLOW_SETTINGS, parseFlowSettings } from '#lib/flow/flow_graph'

test.group('parseFlowSettings', () => {
  test('defaults handoverKeywords to an empty list', ({ assert }) => {
    assert.deepEqual(parseFlowSettings({}), DEFAULT_FLOW_SETTINGS)
    assert.deepEqual(DEFAULT_FLOW_SETTINGS.handoverKeywords, [])
  })

  test('keeps trimmed non-empty handover keywords', ({ assert }) => {
    const settings = parseFlowSettings({
      handoverKeywords: [' agent ', '', 12, 'human'],
    })
    assert.deepEqual(settings.handoverKeywords, ['agent', 'human'])
  })
})
