import { test } from '@japa/runner'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'
import { extractKnowledgeText } from '#services/ai/extract_knowledge_text'

test.group('extractKnowledgeText', () => {
  test('decodes FILE_TXT as utf-8', async ({ assert }) => {
    const text = await extractKnowledgeText(
      AiKnowledgeSourceType.FILE_TXT,
      new TextEncoder().encode('  Store hours  ')
    )
    assert.equal(text, 'Store hours')
  })

  test('rejects unsupported source types', async ({ assert }) => {
    await assert.rejects(
      () => extractKnowledgeText('UNKNOWN', new Uint8Array([1])),
      /Cannot extract text/
    )
  })

  test('strips null bytes from FILE_TXT so Postgres UTF-8 insert can succeed', async ({
    assert,
  }) => {
    const text = await extractKnowledgeText(
      AiKnowledgeSourceType.FILE_TXT,
      new TextEncoder().encode('Hello\u0000 world\u0000')
    )
    assert.equal(text, 'Hello world')
    assert.notInclude(text, '\u0000')
  })
})
