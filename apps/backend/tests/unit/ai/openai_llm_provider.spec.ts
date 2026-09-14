import { test } from '@japa/runner'
import OpenAiLlmProvider from '#services/ai/drivers/openai_llm_provider'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '#services/ai/embedding_space'
import type {
  LangChainChatModel,
  LangChainEmbeddings,
} from '#services/ai/drivers/langchain_completion'

const OPTIONS = {
  systemPrompt: 'Stay grounded.',
  userPrompt: 'Hours?',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  contextChunks: [{ content: 'Open 9-5', score: 0.8 }],
}

function axis(fill: number): number[] {
  return new Array(KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(fill)
}

function stubChat(params: { text?: string; chunks?: string[]; fail?: Error }): LangChainChatModel {
  return {
    async invoke() {
      if (params.fail) throw params.fail
      return {
        content: params.text ?? 'Hello',
        usage_metadata: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
        response_metadata: { model_name: 'gpt-4o-mini' },
      }
    },
    async *stream() {
      if (params.fail) throw params.fail
      for (const delta of params.chunks ?? ['Hel', 'lo']) {
        yield { content: delta }
      }
      yield {
        content: '',
        usage_metadata: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
        response_metadata: { model_name: 'gpt-4o-mini' },
      }
    },
  }
}

function stubEmbeddings(vectors: number[][], fail?: Error): LangChainEmbeddings {
  return {
    async embedDocuments() {
      if (fail) throw fail
      return vectors
    },
  }
}

test.group('OpenAiLlmProvider', () => {
  test('generateCompletion maps text and usage from LangChain', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({ chat: stubChat({ text: '  Open 9-5  ' }) })
    const result = await llm.generateCompletion(OPTIONS)

    assert.equal(result.text, 'Open 9-5')
    assert.equal(result.promptTokens, 4)
    assert.equal(result.completionTokens, 2)
    assert.equal(result.totalTokens, 6)
    assert.equal(result.modelName, 'gpt-4o-mini')
    assert.isAtLeast(result.latencyMs, 0)
  })

  test('streamCompletion yields token deltas then a complete result', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({ chat: stubChat({ chunks: ['Open ', '9-5'] }) })

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
      embeddings: stubEmbeddings([axis(0.2), axis(0.1)]),
    })
    const vectors = await llm.embedTexts(['a', 'b'], 'text-embedding-3-small')
    assert.deepEqual(vectors, [axis(0.2), axis(0.1)])
  })

  test('rejects embeddings that are not 1024-d', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({
      embeddings: stubEmbeddings([[0.2]]),
    })
    await assert.rejects(() => llm.embedTexts(['a'], 'text-embedding-3-small'), /1024/)
  })

  test('wraps provider failures', async ({ assert }) => {
    const llm = new OpenAiLlmProvider({
      chat: stubChat({ fail: new Error('rate limited') }),
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
