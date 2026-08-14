import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { LlmProvider } from '#services/ai/contracts/llm_provider'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'

const OPTIONS = {
  systemPrompt: 'You are a grounded agent.',
  userPrompt: 'What are your hours?',
  contextChunks: [{ content: 'Open 9-5', score: 0.91 }],
}

test.group('FakeLlmProvider', () => {
  test('generateCompletion returns deterministic text and usage', async ({ assert }) => {
    const llm = new FakeLlmProvider()
    llm.text = 'We are open 9 to 5.'

    const result = await llm.generateCompletion(OPTIONS)

    assert.equal(result.text, 'We are open 9 to 5.')
    assert.equal(result.modelName, 'fake')
    assert.isAbove(result.promptTokens, 0)
    assert.isAbove(result.completionTokens, 0)
    assert.equal(result.totalTokens, result.promptTokens + result.completionTokens)
    assert.lengthOf(llm.calls, 1)
    assert.equal(llm.calls[0].userPrompt, 'What are your hours?')
  })

  test('streamCompletion yields deltas then returns the full result', async ({ assert }) => {
    const llm = new FakeLlmProvider()
    llm.text = 'Hello world'

    const deltas: string[] = []
    const generator = llm.streamCompletion(OPTIONS)
    let next = await generator.next()
    while (!next.done) {
      deltas.push(next.value.delta)
      next = await generator.next()
    }

    assert.deepEqual(deltas.join(''), 'Hello world')
    assert.equal(next.value.text, 'Hello world')
    assert.isTrue(next.value.totalTokens > 0)
  })

  test('embedTexts returns deterministic 1536-d vectors and records inputs', async ({ assert }) => {
    const llm = new FakeLlmProvider()
    const [first] = await llm.embedTexts(['Open 9-5'])
    const [again] = await llm.embedTexts(['Open 9-5'])
    const [other] = await llm.embedTexts(['Closed Sundays'])

    assert.lengthOf(first!, 1536)
    assert.deepEqual(first, again)
    assert.notDeepEqual(first, other)
    assert.deepEqual(llm.embedCalls, ['Open 9-5', 'Open 9-5', 'Closed Sundays'])
  })

  test('IoC binds LlmProvider to the fake driver in tests', async ({ assert }) => {
    const llm = await app.container.make(LlmProvider)
    assert.instanceOf(llm, FakeLlmProvider)
    assert.equal(llm.name, 'fake')
  })
})
