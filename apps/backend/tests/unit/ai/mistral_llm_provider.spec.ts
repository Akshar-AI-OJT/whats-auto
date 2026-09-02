import { test } from '@japa/runner'
import MistralLlmProvider from '#services/ai/drivers/mistral_llm_provider'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '#services/ai/embedding_space'
import type {
  LangChainChatModel,
  LangChainEmbeddings,
} from '#services/ai/drivers/langchain_completion'

const OPTIONS = {
  systemPrompt: 'Stay grounded.',
  userPrompt: 'Hours?',
  model: 'mistral-small-latest',
}

function axis(fill: number): number[] {
  return new Array(KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(fill)
}

test.group('MistralLlmProvider', () => {
  test('generateCompletion maps LangChain usage', async ({ assert }) => {
    const chat: LangChainChatModel = {
      async invoke() {
        return {
          content: 'Open 9-5',
          usage_metadata: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
          response_metadata: { model: 'mistral-small-latest' },
        }
      },
      async *stream() {
        yield { content: 'Open 9-5' }
      },
    }
    const llm = new MistralLlmProvider({ chat })
    const result = await llm.generateCompletion(OPTIONS)
    assert.equal(result.text, 'Open 9-5')
    assert.equal(result.totalTokens, 5)
  })

  test('throws when no API key and no injected client', async ({ assert }) => {
    const llm = new MistralLlmProvider({})
    await assert.rejects(() => llm.generateCompletion(OPTIONS), /MISTRAL_API_KEY is required/)
  })

  test('embedTexts accepts native 1024-d vectors', async ({ assert }) => {
    const embeddings: LangChainEmbeddings = {
      async embedDocuments() {
        return [axis(0.3)]
      },
    }
    const llm = new MistralLlmProvider({ embeddings })
    const [vector] = await llm.embedTexts(['hours'], 'mistral-embed')
    assert.lengthOf(vector!, KNOWLEDGE_EMBEDDING_DIMENSIONS)
  })

  test('rejects embeddings that are not 1024-d', async ({ assert }) => {
    const embeddings: LangChainEmbeddings = {
      async embedDocuments() {
        return [new Array(768).fill(0.1)]
      },
    }
    const llm = new MistralLlmProvider({ embeddings })
    await assert.rejects(() => llm.embedTexts(['hours'], 'mistral-embed'), /1024/)
  })
})
