import { test } from '@japa/runner'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import { extractKnowledgeText } from '#services/ai/extract_knowledge_text'

test.group('extractKnowledgeText', () => {
  test('decodes MANUAL_TEXT as utf-8', async ({ assert }) => {
    const text = await extractKnowledgeText(
      AiKnowledgeSourceType.MANUAL_TEXT,
      new TextEncoder().encode('  Store hours  ')
    )
    assert.equal(text, 'Store hours')
  })

  test('rejects unsupported source types', async ({ assert }) => {
    await assert.rejects(
      () => extractKnowledgeText(AiKnowledgeSourceType.FAQ_LIST, new Uint8Array([1])),
      /Cannot extract text/
    )
  })
})
