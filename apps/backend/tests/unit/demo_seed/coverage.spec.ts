import { test } from '@japa/runner'
import * as schema from '#database/schema'
import { APPLICATION_TABLES } from '#database/demo/types'
import { assertRegistryCoverage, allOwnedTables } from '#database/demo/registry'

/** Lucid *Schema export name → postgres table (must stay aligned with schema.ts). */
const SCHEMA_CLASS_TO_TABLE: Record<string, string> = {
  AccountSchema: 'accounts',
  AiKnowledgeChunkSchema: 'ai_knowledge_chunks',
  AiKnowledgeDocumentSchema: 'ai_knowledge_documents',
  AiUsageLogSchema: 'ai_usage_logs',
  ApiKeySchema: 'api_keys',
  AuthorizationAuditSchema: 'authorization_audits',
  BillingOrderSchema: 'billing_orders',
  BroadcastRecipientSchema: 'broadcast_recipients',
  BroadcastSchema: 'broadcasts',
  ContactConsentEventSchema: 'contact_consent_events',
  ContactImportRowSchema: 'contact_import_rows',
  ContactImportSchema: 'contact_imports',
  ContactTagSchema: 'contact_tags',
  ContactSchema: 'contacts',
  ConversationAssignmentSchema: 'conversation_assignments',
  ConversationNoteSchema: 'conversation_notes',
  ConversationSchema: 'conversations',
  FlowExecutionLogSchema: 'flow_execution_logs',
  FlowSessionSchema: 'flow_sessions',
  FlowVersionSchema: 'flow_versions',
  FlowSchema: 'flows',
  IntegrationConnectionSchema: 'integration_connections',
  IntegrationEventSchema: 'integration_events',
  InvoiceLineItemSchema: 'invoice_line_items',
  InvoiceSchema: 'invoices',
  JwkSchema: 'jwks',
  MediaAssetReferenceSchema: 'media_asset_references',
  MediaAssetSchema: 'media_assets',
  MessageTemplateSchema: 'message_templates',
  MessageSchema: 'messages',
  NotificationSchema: 'notifications',
  OrganizationInvitationSchema: 'organization_invitations',
  OrganizationMemberSchema: 'organization_members',
  OrganizationRolePermissionSchema: 'organization_role_permissions',
  OrganizationSmtpConfigSchema: 'organization_smtp_configs',
  OrganizationStorageObjectSchema: 'organization_storage_objects',
  OrganizationStorageUsageSchema: 'organization_storage_usages',
  OrganizationSubscriptionSchema: 'organization_subscriptions',
  OrganizationSchema: 'organizations',
  OutboundDispatchSchema: 'outbound_dispatches',
  PaymentTransactionSchema: 'payment_transactions',
  PaymentWebhookEventSchema: 'payment_webhook_events',
  PermissionSchema: 'permissions',
  PlanSchema: 'plans',
  PlatformAiConfigSchema: 'platform_ai_configs',
  RolePermissionSchema: 'role_permissions',
  RoleSchema: 'roles',
  SessionSchema: 'sessions',
  TagSchema: 'tags',
  UnmatchedProviderReceiptSchema: 'unmatched_provider_receipts',
  UsageMeterSchema: 'usage_meters',
  UserRoleSchema: 'user_roles',
  UserSchema: 'users',
  VerificationSchema: 'verifications',
  WhatsappConfigSchema: 'whatsapp_configs',
}

test.group('Demo seed registry coverage', () => {
  test('SCHEMA_CLASS_TO_TABLE covers every schema.ts *Schema export', ({ assert }) => {
    const schemaExports = Object.keys(schema)
      .filter((k) => k.endsWith('Schema'))
      .sort()
    const mapped = schemaExports.map((name) => {
      const table = SCHEMA_CLASS_TO_TABLE[name]
      assert.exists(table, `Add SCHEMA_CLASS_TO_TABLE mapping for ${name}`)
      return table
    })

    const mappedTables = [...new Set(mapped)].sort()
    for (const table of APPLICATION_TABLES) {
      assert.include(
        mappedTables,
        table,
        `APPLICATION_TABLES entry "${table}" is missing from SCHEMA_CLASS_TO_TABLE`
      )
    }
  })

  test('registry owns each application table exactly once', ({ assert }) => {
    assert.doesNotThrow(() => assertRegistryCoverage())
    assert.lengthOf(allOwnedTables(), APPLICATION_TABLES.length)
  })
})
