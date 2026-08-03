import { FIXTURE_IDS } from '#database/demo/fixture_ids'
import { daysAgo, hoursAgo, jsonb, upsertById, withTenantWrite } from '#database/demo/helpers'
import type { DemoSeedModule } from '#database/demo/types'

export const inboxModule: DemoSeedModule = {
  id: 'inbox',
  ownedTables: ['conversations', 'messages', 'conversation_notes', 'conversation_assignments'],
  dependsOn: ['contacts', 'whatsapp_configs', 'media_assets', 'message_templates'],
  async seed(ctx) {
    await withTenantWrite(FIXTURE_IDS.orgs.northstar, async (trx) => {
      await upsertById(
        'conversations',
        FIXTURE_IDS.conversations.northstarOpen,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          whatsappConfigId: FIXTURE_IDS.whatsappConfigs.northstarConnected,
          contactId: FIXTURE_IDS.contacts.northstarPriya,
          status: 'open',
          assignedAgentId: FIXTURE_IDS.users.northstarAgent,
          lastMessageText: 'Do you have the vase in sage green?',
          lastMessageAt: hoursAgo(1),
          firstResponseAt: hoursAgo(2),
          closedAt: null,
          unreadCount: 1,
        },
        trx
      )

      await upsertById(
        'conversations',
        FIXTURE_IDS.conversations.northstarPending,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          whatsappConfigId: FIXTURE_IDS.whatsappConfigs.northstarConnected,
          contactId: FIXTURE_IDS.contacts.northstarDeleted,
          status: 'pending',
          assignedAgentId: null,
          lastMessageText: 'Waiting on stock confirmation',
          lastMessageAt: daysAgo(1),
          firstResponseAt: null,
          closedAt: null,
          unreadCount: 0,
        },
        trx
      )

      await upsertById(
        'conversations',
        FIXTURE_IDS.conversations.northstarClosed,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          whatsappConfigId: FIXTURE_IDS.whatsappConfigs.northstarDisconnected,
          contactId: FIXTURE_IDS.contacts.northstarPriya,
          status: 'closed',
          assignedAgentId: FIXTURE_IDS.users.northstarAgent,
          lastMessageText: 'Thanks, order confirmed!',
          lastMessageAt: daysAgo(7),
          firstResponseAt: daysAgo(7),
          closedAt: daysAgo(6),
          unreadCount: 0,
        },
        trx
      )

      await upsertById(
        'conversation_assignments',
        FIXTURE_IDS.assignments.northstarAssign,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          conversationId: FIXTURE_IDS.conversations.northstarOpen,
          agentUserId: FIXTURE_IDS.users.northstarAgent,
          assignedByUserId: FIXTURE_IDS.users.northstarAdmin,
          reason: 'Demo seed assignment',
        },
        trx
      )

      await upsertById(
        'conversation_notes',
        FIXTURE_IDS.notes.northstarAgentNote,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          conversationId: FIXTURE_IDS.conversations.northstarOpen,
          authorUserId: FIXTURE_IDS.users.northstarAgent,
          body: 'VIP wholesale customer — prioritize sage green restock reply.',
        },
        trx
      )

      const openId = FIXTURE_IDS.conversations.northstarOpen

      await upsertById(
        'messages',
        FIXTURE_IDS.messages.northstarInboundText,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          conversationId: openId,
          senderType: 'contact',
          senderId: null,
          contentType: 'text',
          contentText: 'Do you have the vase in sage green?',
          mediaUrl: null,
          mediaAssetId: null,
          messageTemplateId: null,
          providerMessageId: 'wamid.demo.northstar.inbound.1',
          status: 'delivered',
          replyToMessageId: null,
          interactiveReplyId: null,
          interactivePayload: null,
          errorMessage: null,
          occurredAt: hoursAgo(3),
          providerStatusAt: hoursAgo(3),
          sentAt: null,
          deliveredAt: hoursAgo(3),
          readAt: null,
          failedAt: null,
          metadata: jsonb({ source: 'demo' }),
        },
        trx
      )

      await upsertById(
        'messages',
        FIXTURE_IDS.messages.northstarOutboundImage,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          conversationId: openId,
          senderType: 'agent',
          senderId: FIXTURE_IDS.users.northstarAgent,
          contentType: 'image',
          contentText: 'Here is the sage green option',
          mediaUrl: 'demo://northstar/media/ceramic-vase.jpg',
          mediaAssetId: FIXTURE_IDS.mediaAssets.northstarProductShot,
          messageTemplateId: null,
          providerMessageId: 'wamid.demo.northstar.outbound.image',
          status: 'read',
          replyToMessageId: FIXTURE_IDS.messages.northstarInboundText,
          interactiveReplyId: null,
          interactivePayload: null,
          errorMessage: null,
          occurredAt: hoursAgo(2),
          providerStatusAt: hoursAgo(1),
          sentAt: hoursAgo(2),
          deliveredAt: hoursAgo(2),
          readAt: hoursAgo(1),
          failedAt: null,
          metadata: jsonb({}),
        },
        trx
      )

      await upsertById(
        'messages',
        FIXTURE_IDS.messages.northstarTemplate,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          conversationId: openId,
          senderType: 'agent',
          senderId: FIXTURE_IDS.users.northstarAdmin,
          contentType: 'template',
          contentText: 'Your Northstar order update',
          mediaUrl: null,
          mediaAssetId: null,
          messageTemplateId: FIXTURE_IDS.templates.northstarApprovedMarketing,
          providerMessageId: 'wamid.demo.northstar.template.1',
          status: 'delivered',
          replyToMessageId: null,
          interactiveReplyId: null,
          interactivePayload: null,
          errorMessage: null,
          occurredAt: hoursAgo(5),
          providerStatusAt: hoursAgo(4),
          sentAt: hoursAgo(5),
          deliveredAt: hoursAgo(4),
          readAt: null,
          failedAt: null,
          metadata: jsonb({ templateName: 'order_update' }),
        },
        trx
      )

      await upsertById(
        'messages',
        FIXTURE_IDS.messages.northstarInteractive,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          conversationId: openId,
          senderType: 'contact',
          senderId: null,
          contentType: 'interactive',
          contentText: 'Track order',
          mediaUrl: null,
          mediaAssetId: null,
          messageTemplateId: null,
          providerMessageId: 'wamid.demo.northstar.interactive.1',
          status: 'delivered',
          replyToMessageId: FIXTURE_IDS.messages.northstarTemplate,
          interactiveReplyId: 'btn_track',
          interactivePayload: jsonb({ type: 'button_reply', id: 'btn_track' }),
          errorMessage: null,
          occurredAt: hoursAgo(4),
          providerStatusAt: hoursAgo(4),
          sentAt: null,
          deliveredAt: hoursAgo(4),
          readAt: null,
          failedAt: null,
          metadata: jsonb({}),
        },
        trx
      )

      await upsertById(
        'messages',
        FIXTURE_IDS.messages.northstarQueued,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          conversationId: openId,
          senderType: 'agent',
          senderId: FIXTURE_IDS.users.northstarAgent,
          contentType: 'text',
          contentText: 'Checking warehouse stock now…',
          mediaUrl: null,
          mediaAssetId: null,
          messageTemplateId: null,
          providerMessageId: null,
          status: 'queued',
          replyToMessageId: null,
          interactiveReplyId: null,
          interactivePayload: null,
          errorMessage: null,
          occurredAt: hoursAgo(0),
          providerStatusAt: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          metadata: jsonb({}),
        },
        trx
      )

      await upsertById(
        'messages',
        FIXTURE_IDS.messages.northstarFailed,
        {
          organizationId: FIXTURE_IDS.orgs.northstar,
          conversationId: FIXTURE_IDS.conversations.northstarClosed,
          senderType: 'agent',
          senderId: FIXTURE_IDS.users.northstarAgent,
          contentType: 'text',
          contentText: 'Could not deliver follow-up',
          mediaUrl: null,
          mediaAssetId: null,
          messageTemplateId: null,
          providerMessageId: 'wamid.demo.northstar.failed.1',
          status: 'failed',
          replyToMessageId: null,
          interactiveReplyId: null,
          interactivePayload: null,
          errorMessage: 'Demo: recipient unavailable',
          occurredAt: daysAgo(6),
          providerStatusAt: daysAgo(6),
          sentAt: daysAgo(6),
          deliveredAt: null,
          readAt: null,
          failedAt: daysAgo(6),
          metadata: jsonb({ errorCode: 'demo_failed' }),
        },
        trx
      )
    })

    await withTenantWrite(FIXTURE_IDS.orgs.harbor, async (trx) => {
      await upsertById(
        'conversations',
        FIXTURE_IDS.conversations.harborOpen,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          whatsappConfigId: FIXTURE_IDS.whatsappConfigs.harborError,
          contactId: FIXTURE_IDS.contacts.harborJordan,
          status: 'open',
          assignedAgentId: FIXTURE_IDS.users.harborAgent,
          lastMessageText: 'Is the 6am spin class open?',
          lastMessageAt: hoursAgo(2),
          firstResponseAt: null,
          closedAt: null,
          unreadCount: 1,
        },
        trx
      )

      await upsertById(
        'messages',
        FIXTURE_IDS.messages.harborInbound,
        {
          organizationId: FIXTURE_IDS.orgs.harbor,
          conversationId: FIXTURE_IDS.conversations.harborOpen,
          senderType: 'contact',
          senderId: null,
          contentType: 'text',
          contentText: 'Is the 6am spin class open?',
          mediaUrl: null,
          mediaAssetId: null,
          messageTemplateId: null,
          providerMessageId: 'wamid.demo.harbor.inbound.1',
          status: 'delivered',
          replyToMessageId: null,
          interactiveReplyId: null,
          interactivePayload: null,
          errorMessage: null,
          occurredAt: hoursAgo(2),
          providerStatusAt: hoursAgo(2),
          sentAt: null,
          deliveredAt: hoursAgo(2),
          readAt: null,
          failedAt: null,
          metadata: jsonb({}),
        },
        trx
      )
    })

    ctx.conversations = { ...FIXTURE_IDS.conversations }
  },
}
