import { test } from '@japa/runner'
import { ShopenupEventMapperService } from '#services/integrations/shopenup_event_mapper_service'
import IntegrationException from '#exceptions/integration_exception'

const mapper = new ShopenupEventMapperService()

test.group('Shopenup event mapper', () => {
  test('maps COD order.placed to commerce.order_placed', ({ assert }) => {
    const mapped = mapper.map({
      eventType: 'order.placed',
      timestamp: '2026-08-17T12:00:00.000Z',
      data: {
        orderId: 'ord_cod',
        isCod: true,
        customerPhone: '+919999999999',
      },
    })

    assert.equal(mapped.type, 'commerce.order_placed')
    assert.equal(mapped.externalEventId, 'order.placed:ord_cod')
    assert.equal(mapped.subject.phone, '+919999999999')
  })

  test('maps prepaid order.placed to commerce.order_paid', ({ assert }) => {
    const mapped = mapper.map({
      eventType: 'order.placed',
      data: {
        orderId: 'ord_paid',
        payment_status: 'captured',
      },
    })

    assert.equal(mapped.type, 'commerce.order_paid')
    assert.equal(mapped.externalEventId, 'order.placed:ord_paid')
  })

  test('namespaces commerce ledger ids so shipped and delivered are not duplicates of placed', ({
    assert,
  }) => {
    const orderId = 'ord_same'
    const placed = mapper.map({
      eventType: 'order.placed',
      data: { orderId, isCod: true },
    })
    const shipped = mapper.map({
      eventType: 'order.fulfillment_created',
      data: { orderId, fulfillmentId: 'ful_1' },
    })
    const delivered = mapper.map({
      eventType: 'order.delivered',
      data: { orderId, fulfillmentId: 'ful_1' },
    })

    assert.equal(placed.externalEventId, 'order.placed:ord_same')
    assert.equal(shipped.externalEventId, 'order.fulfillment_created:ord_same:ful_1')
    assert.equal(delivered.externalEventId, 'order.delivered:ord_same:ful_1')
    assert.notEqual(placed.externalEventId, shipped.externalEventId)
    assert.notEqual(shipped.externalEventId, delivered.externalEventId)
  })

  test('maps payment.captured to commerce.order_paid with a distinct ledger id', ({ assert }) => {
    const mapped = mapper.map({
      eventType: 'payment.captured',
      data: {
        orderId: 'ord_same',
        paymentId: 'pay_1',
        customerPhone: '+919999999999',
      },
    })
    assert.equal(mapped.type, 'commerce.order_paid')
    assert.equal(mapped.externalEventId, 'payment.captured:ord_same:pay_1')
    assert.notEqual(
      mapped.externalEventId,
      mapper.map({
        eventType: 'order.placed',
        data: { orderId: 'ord_same', isCod: true },
      }).externalEventId
    )
  })

  test('maps fulfillment and product events', ({ assert }) => {
    assert.equal(
      mapper.map({
        eventType: 'order.fulfillment_created',
        data: { orderId: 'ord_ship' },
      }).type,
      'commerce.order_shipped'
    )
    assert.equal(
      mapper.map({
        eventType: 'order.delivered',
        data: { orderId: 'ord_del' },
      }).type,
      'commerce.order_delivered'
    )
    assert.equal(
      mapper.map({
        eventType: 'product.created',
        data: { productHandle: 'blue-shirt' },
      }).externalEventId,
      'blue-shirt'
    )
  })

  test('rejects unknown types and missing ids', ({ assert }) => {
    try {
      mapper.map({ eventType: 'order.refunded', data: { orderId: 'ord_1' } })
      assert.fail('expected unmapped event')
    } catch (error) {
      assert.instanceOf(error, IntegrationException)
      assert.equal((error as IntegrationException).code, 'E_INTEGRATION_EVENT_UNMAPPED')
    }

    try {
      mapper.map({ eventType: 'order.placed', data: { isCod: true } })
      assert.fail('expected missing event id')
    } catch (error) {
      assert.instanceOf(error, IntegrationException)
      assert.equal((error as IntegrationException).code, 'E_INTEGRATION_EVENT_ID_MISSING')
    }
  })
})
