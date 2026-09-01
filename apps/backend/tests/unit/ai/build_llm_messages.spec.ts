import { test } from '@japa/runner'
import { buildLlmMessages } from '#services/ai/build_llm_messages'

test.group('buildLlmMessages', () => {
  test('keeps chunks in the user turn, not the system role', ({ assert }) => {
    const messages = buildLlmMessages({
      systemPrompt: 'Stay grounded.',
      userPrompt: 'Hours?',
      contextChunks: [{ content: 'Open 9-5', score: 0.91 }],
    })

    assert.deepEqual(messages[0], { role: 'system', content: 'Stay grounded.' })
    assert.equal(messages[1].role, 'user')
    assert.include(messages[1].content, '<reference_material>')
    assert.include(messages[1].content, 'Open 9-5')
    assert.include(messages[1].content, '0.91')
    assert.include(messages[1].content, '<customer_message>')
    assert.include(messages[1].content, 'Hours?')
    assert.notInclude(messages[0].content, 'Open 9-5')
  })

  test('omits the reference block when there are no chunks', ({ assert }) => {
    const messages = buildLlmMessages({
      systemPrompt: 'Stay grounded.',
      userPrompt: 'Hours?',
    })

    assert.equal(messages[0].content, 'Stay grounded.')
    assert.equal(messages[1].content, '<customer_message>\nHours?\n</customer_message>')
  })
})
