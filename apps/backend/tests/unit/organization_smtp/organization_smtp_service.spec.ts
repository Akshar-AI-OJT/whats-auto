import { test } from '@japa/runner'
import {
  OrganizationSmtpProviderPreset,
  SMTP_ONLY_PROVIDER_PRESETS,
} from '#enums/organization_smtp_provider_preset'
import { OrganizationSmtpStatus } from '#enums/organization_smtp_status'
import { OrganizationSmtpTransport } from '#enums/organization_smtp_transport'
import OrganizationSmtpException from '#exceptions/organization_smtp_exception'
import { encryptIntegrationSecret } from '#lib/integrations/secret_crypto'
import type { OrganizationSmtpConfigRepository } from '#repositories/organization_smtp_config_repository'
import type { OrgMailTransport } from '#services/mail/org_mail_types'
import { OrganizationSmtpService } from '#services/organization_smtp_service'

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cfg-1',
    organizationId: 'org-1',
    transport: OrganizationSmtpTransport.SMTP,
    providerPreset: OrganizationSmtpProviderPreset.CUSTOM,
    senderName: 'Acme',
    senderEmail: 'notify@acme.com',
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    username: 'user',
    passwordEncrypted: encryptIntegrationSecret('smtp-pass'),
    apiKeyEncrypted: null,
    status: OrganizationSmtpStatus.VERIFIED,
    lastTestedAt: null,
    lastErrorMessage: null,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  }
}

test.group('OrganizationSmtpService', () => {
  test('rejects API transport for SMTP-only presets', async ({ assert }) => {
    const configs = {
      findByOrgId: async () => null,
      upsertForOrg: async () => makeRow(),
      deleteForOrg: async () => true,
      updateStatus: async () => makeRow(),
    } as unknown as OrganizationSmtpConfigRepository

    const smtpTransport: OrgMailTransport = {
      async verify() {},
      async send() {},
    }

    const service = new OrganizationSmtpService(configs, smtpTransport, smtpTransport)

    try {
      await service.upsertConfig({
        organizationId: 'org-1',
        actorUserId: 'user-1',
        data: {
          transport: OrganizationSmtpTransport.API,
          providerPreset: OrganizationSmtpProviderPreset.GMAIL,
          senderName: 'Acme',
          senderEmail: 'notify@acme.com',
          apiKey: 'secret-key',
        },
      })
      assert.fail('expected invalid transport error')
    } catch (error) {
      assert.instanceOf(error, OrganizationSmtpException)
      assert.equal((error as OrganizationSmtpException).code, 'E_SMTP_INVALID_TRANSPORT')
    }
  })

  test('sendOrgEmail defers custom SMTP failures to retry queue', async ({ assert }) => {
    let enqueued = false
    const smtpTransport: OrgMailTransport = {
      async verify() {},
      async send() {
        throw new Error('smtp down')
      },
    }

    const configs = {
      findByOrgId: async () => makeRow(),
      upsertForOrg: async () => makeRow(),
      deleteForOrg: async () => true,
      updateStatus: async () => makeRow(),
    } as unknown as OrganizationSmtpConfigRepository

    const service = new OrganizationSmtpService(configs, smtpTransport, smtpTransport)
    ;(service as unknown as { enqueueRetry: () => Promise<void> }).enqueueRetry = async () => {
      enqueued = true
    }

    const result = await service.sendOrgEmail({
      organizationId: 'org-1',
      to: 'invitee@example.com',
      subject: 'Invite',
      html: '<p>Hi</p>',
      emailKind: 'invitation',
      invitationId: 'inv-1',
    })

    assert.isTrue(result.deferred)
    assert.isTrue(enqueued)
  })

  test('SMTP-only preset set includes gmail and ses', ({ assert }) => {
    assert.isTrue(SMTP_ONLY_PROVIDER_PRESETS.has(OrganizationSmtpProviderPreset.GMAIL))
    assert.isTrue(SMTP_ONLY_PROVIDER_PRESETS.has(OrganizationSmtpProviderPreset.SES))
    assert.isFalse(SMTP_ONLY_PROVIDER_PRESETS.has(OrganizationSmtpProviderPreset.RESEND))
  })
})
