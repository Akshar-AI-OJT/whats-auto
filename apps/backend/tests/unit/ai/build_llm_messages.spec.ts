import { test } from '@japa/runner'
import { buildLlmMessages } from '#services/ai/build_llm_messages'

test.group('buildLlmMessages', () => {
  test('appends retrieved chunks to the system prompt', ({ assert }) => {
    const messages = buildLlmMessages({
      systemPrompt: 'Stay grounded.',
      userPrompt: 'Hours?',
      contextChunks: [{ content: 'Open 9-5', score: 0.91 }],
    })

    assert.equal(messages[0].role, 'system')
    assert.include(messages[0].content, 'Stay grounded.')
    assert.include(messages[0].content, 'Open 9-5')
    assert.include(messages[0].content, '0.91')
    assert.deepEqual(messages[1], { role: 'user', content: 'Hours?' })
  })

  test('omits the context block when there are no chunks', ({ assert }) => {
    const messages = buildLlmMessages({
      systemPrompt: 'Stay grounded.',
      userPrompt: 'Hours?',
    })

    assert.equal(messages[0].content, 'Stay grounded.')
  })
})
