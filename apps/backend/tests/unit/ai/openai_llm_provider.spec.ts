import { test } from '@japa/runner'
import type OpenAI from 'openai'
import OpenAiLlmProvider from '#services/ai/drivers/openai_llm_provider'

const OPTIONS = {
  systemPrompt: 'Stay grounded.',
  userPrompt: 'Hours?',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  contextChunks: [{ content: 'Open 9-5', score: 0.8 }],
}

function stubClient(params: {
  text?: string
  chunks?: string[]
  fail?: Error
  embeddings?: number[][]
}): OpenAI {
  return {
    embeddings: {
      create: async () => {
        if (params.fail) throw params.fail
        return {
          data: (params.embeddings ?? [[0.1, 0.2]]).map((embedding, index) => ({
            embedding,
            index,
          })),
        }
      },
    },
    chat: {
      completions: {
        create: async (body: { stream?: boolean }) => {
          if (params.fail) throw params.fail
          if (body.stream) {
            return (async function* () {
              for (const delta of params.chunks ?? ['Hel', 'lo']) {
                yield {
                  choices: [{ delta: { content: delta } }],
                  model: 'gpt-4o-mini',
                }
              }
              yield {
                choices: [{ delta: {} }],
                model: 'gpt-4o-mini',
                usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
              }
            })()
          }

          return {
            choices: [{ message: { content: params.text ?? 'Hello' } }],
            usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
            model: 'gpt-4o-mini',
          }
        },
      },
    },
  } as unknown as OpenAI
}

test.group('OpenAiLlmProvider', () => {
  test('generateCompletion maps text and usage from the client', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({ client: stubClient({ text: '  Open 9-5  ' }) })
    const result = await llm.generateCompletion(OPTIONS)

    assert.equal(result.text, 'Open 9-5')
    assert.equal(result.promptTokens, 4)
    assert.equal(result.completionTokens, 2)
    assert.equal(result.totalTokens, 6)
    assert.equal(result.modelName, 'gpt-4o-mini')
    assert.isAtLeast(result.latencyMs, 0)
  })

  test('streamCompletion yields token deltas then a complete result', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({
      client: stubClient({ chunks: ['Open ', '9-5'] }),
    })

    const deltas: string[] = []
    const generator = llm.streamCompletion(OPTIONS)
    let next = await generator.next()
    while (!next.done) {
      if (next.value.delta) deltas.push(next.value.delta)
      next = await generator.next()
    }

    assert.deepEqual(deltas, ['Open ', '9-5'])
    assert.equal(next.value.text, 'Open 9-5')
    assert.equal(next.value.totalTokens, 6)
  })

  test('throws when no API key and no injected client', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({})
    await assert.rejects(() => llm.generateCompletion(OPTIONS), /OPENAI_API_KEY is required/)
  })

  test('embedTexts returns vectors in input order', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({
      client: stubClient({ embeddings: [[0.2], [0.1]] }),
    })
    const vectors = await llm.embedTexts(['a', 'b'], 'text-embedding-3-small')
    assert.deepEqual(vectors, [[0.2], [0.1]])
  })

  test('wraps provider failures', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({
      client: stubClient({ fail: new Error('rate limited') }),
    })
    await assert.rejects(() => llm.generateCompletion(OPTIONS), /rate limited/)
  })
})

const liveEnabled = process.env.OPENAI_LIVE_TEST === '1' && Boolean(process.env.OPENAI_API_KEY)

test.group('OpenAiLlmProvider live', () => {
  test('generateCompletion against the real API', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({ apiKey: process.env.OPENAI_API_KEY })
    const result = await llm.generateCompletion({
      systemPrompt: 'Reply with the single word pong.',
      userPrompt: 'ping',
      maxTokens: 8,
      temperature: 0,
    })

    assert.isAbove(result.text.length, 0)
    assert.isAbove(result.totalTokens, 0)
  })
    .timeout(20_000)
    .skip(!liveEnabled, 'Set OPENAI_LIVE_TEST=1 and OPENAI_API_KEY')
})
