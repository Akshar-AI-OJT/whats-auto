import { test } from '@japa/runner'
import {
  COMMERCE_TEMPLATE_BY_TYPE,
  collectNotifierValues,
  pickRequiredTemplateValues,
} from '#lib/integrations/notifier_mapping'

test.group('notifier mapping', () => {
  test('maps commerce types to Shopenup template names', ({ assert }) => {
    assert.equal(COMMERCE_TEMPLATE_BY_TYPE['commerce.order_placed'], 'shopenup_cod_to_prepaid')
    assert.equal(COMMERCE_TEMPLATE_BY_TYPE['commerce.order_paid'], 'shopenup_order_confirmed')
    assert.equal(COMMERCE_TEMPLATE_BY_TYPE['commerce.order_shipped'], 'shopenup_order_shipped')
    assert.equal(
      COMMERCE_TEMPLATE_BY_TYPE['commerce.order_delivered'],
      'shopenup_order_delivered_review'
    )
    assert.equal(COMMERCE_TEMPLATE_BY_TYPE['commerce.product_created'], 'shopenup_new_arrival')
  })

  test('collects named values from subject and payload aliases', ({ assert }) => {
    const collected = collectNotifierValues({
      subject: { phone: '+919999999999', externalOrderId: 'ord_1' },
      payload: {
        customerName: 'Ada',
        productHandle: 'blue-shirt',
        imageUrl: 'https://media.test.local/p.jpg',
      },
    })

    assert.equal(collected.parameters.customer_name, 'Ada')
    assert.equal(collected.parameters.order_id, 'ord_1')
    assert.equal(collected.parameters.cta_url, 'blue-shirt')
    assert.equal(collected.parameters.sku, 'blue-shirt')
    assert.equal(collected.headerMediaUrl, 'https://media.test.local/p.jpg')
  })

  test('pickRequiredTemplateValues fails closed on missing keys', ({ assert }) => {
    const missing = pickRequiredTemplateValues({
      required: ['customer_name', 'order_id'],
      candidates: { customer_name: 'Ada' },
    })
    assert.isFalse(missing.ok)

    const ok = pickRequiredTemplateValues({
      required: ['customer_name'],
      candidates: { customer_name: 'Ada', extra: 'x' },
    })
    assert.isTrue(ok.ok)
    if (ok.ok) {
      assert.deepEqual(ok.values, { customer_name: 'Ada' })
    }
  })
})
