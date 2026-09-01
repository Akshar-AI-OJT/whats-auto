import { test } from '@japa/runner'
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'
import { LlmChatProvider } from '#enums/llm_chat_provider'
import GoogleLlmProvider, {
  requestOutputDimensionality,
} from '#services/ai/drivers/google_llm_provider'
import { catalogForProvider } from '#services/ai/platform_ai_models'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '#services/ai/embedding_space'
import type {
  LangChainChatModel,
  LangChainEmbeddings,
} from '#services/ai/drivers/langchain_completion'

const OPTIONS = {
  systemPrompt: 'Stay grounded.',
  userPrompt: 'Hours?',
  model: 'gemini-2.0-flash',
}

function axis(fill: number): number[] {
  return new Array(KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(fill)
}

test.group('GoogleLlmProvider', () => {
  test('generateCompletion maps LangChain usage', async ({ assert }) => {
    const chat: LangChainChatModel = {
      async invoke() {
        return {
          content: 'Open 9-5',
          usage_metadata: { input_tokens: 3, output_tokens: 5, total_tokens: 8 },
          response_metadata: { model: 'gemini-2.0-flash' },
        }
      },
      async *stream() {
        yield { content: 'Open 9-5' }
      },
    }
    const llm = new GoogleLlmProvider({ chat })
    const result = await llm.generateCompletion(OPTIONS)
    assert.equal(result.text, 'Open 9-5')
    assert.equal(result.totalTokens, 8)
    assert.equal(result.modelName, 'gemini-2.0-flash')
  })

  test('throws when no API key and no injected client', async ({ assert }) => {
    const llm = new GoogleLlmProvider({})
    await assert.rejects(() => llm.generateCompletion(OPTIONS), /GOOGLE_AI_API_KEY is required/)
  })

  test('rejects embeddings that are not 1024-d', async ({ assert }) => {
    const embeddings: LangChainEmbeddings = {
      async embedDocuments() {
        return [new Array(768).fill(0.1)]
      },
    }
    const llm = new GoogleLlmProvider({ embeddings })
    await assert.rejects(() => llm.embedTexts(['hours']), /1024/)
  })

  test('embedTexts accepts 1024-d vectors', async ({ assert }) => {
    const embeddings: LangChainEmbeddings = {
      async embedDocuments() {
        return [axis(0.4)]
      },
    }
    const llm = new GoogleLlmProvider({ embeddings })
    const [vector] = await llm.embedTexts(['hours'])
    assert.lengthOf(vector!, KNOWLEDGE_EMBEDDING_DIMENSIONS)
  })

  test('requests Gemini outputDimensionality 1024', ({ assert }) => {
    const model = catalogForProvider(LlmChatProvider.Google).defaults.embeddingModel
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: 'test-key',
      model,
    })
    requestOutputDimensionality(embeddings, KNOWLEDGE_EMBEDDING_DIMENSIONS)
    const payload = (
      embeddings as unknown as { _convertToContent: (text: string) => Record<string, unknown> }
    )._convertToContent('hours')
    assert.equal(payload.outputDimensionality, KNOWLEDGE_EMBEDDING_DIMENSIONS)
  })
})
