import { test } from '@japa/runner'
import {
  InteractiveMessageError,
  META_INTERACTIVE_LIMITS,
  assertInteractivePayload,
  serializeInteractivePayload,
} from '#lib/meta_whatsapp/interactive_message'

const validButton = {
  type: 'button' as const,
  body: { text: 'Choose an option' },
  action: {
    buttons: [
      { type: 'reply' as const, reply: { id: 'btn_products', title: 'Products' } },
      { type: 'reply' as const, reply: { id: 'btn_stop', title: 'Stop' } },
    ],
  },
}

const validList = {
  type: 'list' as const,
  body: { text: 'Pick a product' },
  action: {
    button: 'View options',
    sections: [
      {
        title: 'Catalog',
        rows: [
          { id: 'opt_a', title: 'Product A', description: 'First item' },
          { id: 'opt_b', title: 'Product B' },
        ],
      },
    ],
  },
}

test.group('interactive message limits', () => {
  test('accepts valid button and list payloads', ({ assert }) => {
    assert.deepEqual(serializeInteractivePayload(validButton), validButton)
    assert.deepEqual(serializeInteractivePayload(validList), validList)
  })

  test('rejects more than 3 buttons', ({ assert }) => {
    assert.throws(
      () =>
        assertInteractivePayload({
          ...validButton,
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'a', title: 'A' } },
              { type: 'reply', reply: { id: 'b', title: 'B' } },
              { type: 'reply', reply: { id: 'c', title: 'C' } },
              { type: 'reply', reply: { id: 'd', title: 'D' } },
            ],
          },
        }),
      InteractiveMessageError,
      `at most ${META_INTERACTIVE_LIMITS.maxButtons} buttons`
    )
  })

  test('rejects button titles over 20 characters', ({ assert }) => {
    assert.throws(
      () =>
        assertInteractivePayload({
          ...validButton,
          action: {
            buttons: [{ type: 'reply', reply: { id: 'btn', title: 'This title is 21 chars!' } }],
          },
        }),
      InteractiveMessageError,
      'Button title exceeds 20 characters'
    )
  })

  test('rejects more than 10 list rows', ({ assert }) => {
    assert.throws(
      () =>
        assertInteractivePayload({
          type: 'list',
          body: { text: 'Pick' },
          action: {
            button: 'Open',
            sections: [
              {
                title: 'All',
                rows: Array.from({ length: 11 }, (_, i) => ({
                  id: `row_${i}`,
                  title: `Row ${i}`,
                })),
              },
            ],
          },
        }),
      InteractiveMessageError,
      `at most ${META_INTERACTIVE_LIMITS.maxListRows} rows`
    )
  })

  test('rejects section and row titles over 24 characters', ({ assert }) => {
    assert.throws(
      () =>
        assertInteractivePayload({
          type: 'list',
          body: { text: 'Pick' },
          action: {
            button: 'Open',
            sections: [
              {
                title: 'This section title is 25c!',
                rows: [{ id: 'r1', title: 'Ok' }],
              },
            ],
          },
        }),
      InteractiveMessageError,
      'List section title exceeds 24 characters'
    )

    assert.throws(
      () =>
        assertInteractivePayload({
          type: 'list',
          body: { text: 'Pick' },
          action: {
            button: 'Open',
            sections: [
              {
                title: 'Ok',
                rows: [{ id: 'r1', title: 'This row title is 25 chars!' }],
              },
            ],
          },
        }),
      InteractiveMessageError,
      'List row title exceeds 24 characters'
    )
  })

  test('rejects row descriptions over 72 characters', ({ assert }) => {
    assert.throws(
      () =>
        assertInteractivePayload({
          type: 'list',
          body: { text: 'Pick' },
          action: {
            button: 'Open',
            sections: [
              {
                title: 'Ok',
                rows: [
                  {
                    id: 'r1',
                    title: 'Row',
                    description: 'x'.repeat(73),
                  },
                ],
              },
            ],
          },
        }),
      InteractiveMessageError,
      'List row description exceeds 72 characters'
    )
  })
})
