import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysAgo, jsonb, upsertById, withTenantWrite } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

export const messageTemplatesModule: DemoSeedModule = {
  id: 'message_templates',
  ownedTables: ['message_templates'],
  dependsOn: ['whatsapp_configs'],
  async seed(ctx) {
    await withTenantWrite(FIXTURE_IDS.orgs.northstar, async (trx) => {
      await upsertById(
        'message_templates',
        FIXTURE_IDS.templates.northstarDraftUtility,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          whatsappConfigId: FIXTURE_IDS.whatsappConfigs.northstarConnected,
          createdByUserId: FIXTURE_IDS.users.northstarAdmin,
          name: 'order_shipped_draft',
          category: 'utility',
          language: 'en',
          headerType: 'text',
          headerContent: 'Order update',
          headerMediaUrl: null,
          bodyText: 'Hi {{1}}, your order {{2}} has shipped.',
          footerText: 'Northstar Home Goods',
          buttons: jsonb([{ type: 'url', text: 'Track', url: 'https://northstar.demo/track' }]),
          sampleValues: jsonb({ '1': 'Priya', '2': 'NS-1001' }),
          status: 'draft',
          metaTemplateId: null,
          rejectionReason: null,
          qualityScore: null,
          submissionError: null,
          lastSubmittedAt: null,
        },
        trx
      )

      await upsertById(
        'message_templates',
        FIXTURE_IDS.templates.northstarApprovedMarketing,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          whatsappConfigId: FIXTURE_IDS.whatsappConfigs.northstarConnected,
          createdByUserId: FIXTURE_IDS.users.northstarOwner,
          name: 'order_update',
          category: 'marketing',
          language: 'en',
          headerType: 'none',
          headerContent: null,
          headerMediaUrl: null,
          bodyText: 'Hello {{customer_name}}, your Northstar order is on the way.',
          footerText: null,
          buttons: jsonb([
            { type: 'quick_reply', text: 'Track order' },
            { type: 'quick_reply', text: 'Talk to agent' },
          ]),
          sampleValues: jsonb({ customer_name: 'Priya' }),
          status: 'approved',
          metaTemplateId: 'demo-meta-tpl-order-update',
          rejectionReason: null,
          qualityScore: 'GREEN',
          submissionError: null,
          lastSubmittedAt: daysAgo(20),
        },
        trx
      )

      await upsertById(
        'message_templates',
        FIXTURE_IDS.templates.northstarRejectedAuth,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          whatsappConfigId: FIXTURE_IDS.whatsappConfigs.northstarConnected,
          createdByUserId: FIXTURE_IDS.users.northstarAdmin,
          name: 'login_otp_rejected',
          category: 'authentication',
          language: 'en',
          headerType: 'none',
          headerContent: null,
          headerMediaUrl: null,
          bodyText: 'Your code is {{otp}}',
          footerText: null,
          buttons: null,
          sampleValues: jsonb({ otp: '123456' }),
          status: 'rejected',
          metaTemplateId: null,
          rejectionReason: 'Demo: authentication template missing required components',
          qualityScore: null,
          submissionError: null,
          lastSubmittedAt: daysAgo(10),
        },
        trx
      )
    })

    await withTenantWrite(FIXTURE_IDS.orgs.harbor, async (trx) => {
      await upsertById(
        'message_templates',
        FIXTURE_IDS.templates.harborApprovedUtility,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          whatsappConfigId: FIXTURE_IDS.whatsappConfigs.harborError,
          createdByUserId: FIXTURE_IDS.users.harborOwner,
          name: 'class_reminder',
          category: 'utility',
          language: 'en_US',
          headerType: 'text',
          headerContent: 'Class reminder',
          headerMediaUrl: null,
          bodyText: 'Hi {{1}}, your {{2}} class starts in 1 hour.',
          footerText: 'Harbor Fitness',
          buttons: null,
          sampleValues: jsonb({ '1': 'Jordan', '2': 'Spin' }),
          status: 'approved',
          metaTemplateId: 'demo-meta-tpl-class-reminder',
          rejectionReason: null,
          qualityScore: 'YELLOW',
          submissionError: null,
          lastSubmittedAt: daysAgo(5),
        },
        trx
      )
    })

    ctx.templates = { ...FIXTURE_IDS.templates }
  },
}
