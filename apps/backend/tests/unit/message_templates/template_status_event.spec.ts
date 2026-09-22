import { test } from '@japa/runner'
import {
  mapMetaTemplateStatusEvent,
  MessageTemplateService,
} from '#services/message_template_service'

test.group('mapMetaTemplateStatusEvent', () => {
  test('maps known Meta events to local statuses', ({ assert }) => {
    assert.equal(mapMetaTemplateStatusEvent('APPROVED'), 'approved')
    assert.equal(mapMetaTemplateStatusEvent('REINSTATED'), 'approved')
    assert.equal(mapMetaTemplateStatusEvent('FLAGGED'), 'approved')
    assert.equal(mapMetaTemplateStatusEvent('REJECTED'), 'rejected')
    assert.equal(mapMetaTemplateStatusEvent('PENDING'), 'pending')
    assert.equal(mapMetaTemplateStatusEvent('IN_APPEAL'), 'pending')
    assert.equal(mapMetaTemplateStatusEvent('PAUSED'), 'paused')
    assert.equal(mapMetaTemplateStatusEvent('DISABLED'), 'disabled')
    assert.equal(mapMetaTemplateStatusEvent('DELETED'), 'deleted')
    assert.equal(mapMetaTemplateStatusEvent('ARCHIVED'), 'deleted')
    assert.equal(mapMetaTemplateStatusEvent('LOCKED'), 'locked')
  })
})

test.group('MessageTemplateService.applyStatusFromMetaEvent', (group) => {
  group.tap((t) => t.timeout(30_000))

  // Functional coverage lives in template_status_webhook.spec.ts (needs DB).
  // This group keeps the mapper + service export resolvable for unit runners.
  test('service exports applyStatusFromMetaEvent', ({ assert }) => {
    assert.isFunction(new MessageTemplateService().applyStatusFromMetaEvent)
  })
})
