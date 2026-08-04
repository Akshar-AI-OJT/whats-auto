import { test } from '@japa/runner'
import { MetaGraphApiError, type MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { WhatsappEmbeddedSignupService } from '#services/whatsapp_embedded_signup_service'
import type WhatsappConfigException from '#exceptions/whatsapp_config_exception'

function fakeGraph(overrides: Partial<MetaGraphClient> = {}): MetaGraphClient {
  return {
    exchangeEmbeddedSignupCode: async () => ({ accessToken: 'tok' }),
    subscribeAppToWaba: async () => {},
    registerPhoneNumber: async () => {},
    getPhoneNumber: async ({ phoneNumberId }) => ({ id: phoneNumberId }),
    sendTemplateMessage: async () => ({ raw: {} }),
    sendTextMessage: async () => ({ raw: {} }),
    sendMediaMessage: async () => ({ raw: {} }),
    ...overrides,
  }
}

test.group('WhatsappEmbeddedSignupService.mapGraphError', () => {
  test('maps MetaGraphApiError 4xx to 422 E_WA_META_GRAPH', ({ assert }) => {
    const service = new WhatsappEmbeddedSignupService(fakeGraph())
    const mapped = (
      service as unknown as {
        mapGraphError: (e: unknown) => WhatsappConfigException
      }
    ).mapGraphError(new MetaGraphApiError('bad code', 400, null, 'exchangeCode'))

    assert.equal(mapped.code, 'E_WA_META_GRAPH')
    assert.equal(mapped.status, 422)
    assert.equal(mapped.message, 'bad code')
  })

  test('maps MetaGraphApiError 5xx to 502', ({ assert }) => {
    const service = new WhatsappEmbeddedSignupService(fakeGraph())
    const mapped = (
      service as unknown as {
        mapGraphError: (e: unknown) => WhatsappConfigException
      }
    ).mapGraphError(new MetaGraphApiError('down', 503, null, 'subscribeApps'))

    assert.equal(mapped.status, 502)
  })
})
