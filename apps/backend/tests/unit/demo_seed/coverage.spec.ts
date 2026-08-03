import { test } from '@japa/runner'
import * as schema from '#database/schema'
import { APPLICATION_TABLES } from '#database/demo/types'
import { assertRegistryCoverage, allOwnedTables } from '#database/demo/registry'

/** Lucid *Schema export name → postgres table (must stay aligned with schema.ts). */
const SCHEMA_CLASS_TO_TABLE: Record<string, string> = {
  AccountSchema: 'accounts',
  AuthorizationAuditSchema: 'authorization_audits',
  ContactSchema: 'contacts',
  ConversationAssignmentSchema: 'conversation_assignments',
  ConversationNoteSchema: 'conversation_notes',
  ConversationSchema: 'conversations',
  JwkSchema: 'jwks',
  MediaAssetSchema: 'media_assets',
  MessageTemplateSchema: 'message_templates',
  MessageSchema: 'messages',
  OrganizationInvitationSchema: 'organization_invitations',
  OrganizationMemberSchema: 'organization_members',
  OrganizationRolePermissionSchema: 'organization_role_permissions',
  OrganizationSubscriptionSchema: 'organization_subscriptions',
  OrganizationSchema: 'organizations',
  PaymentTransactionSchema: 'payment_transactions',
  PermissionSchema: 'permissions',
  PlanSchema: 'plans',
  RolePermissionSchema: 'role_permissions',
  RoleSchema: 'roles',
  SessionSchema: 'sessions',
  UsageMeterSchema: 'usage_meters',
  UserRoleSchema: 'user_roles',
  UserSchema: 'users',
  VerificationSchema: 'verifications',
  WhatsappConfigSchema: 'whatsapp_configs',
}

test.group('Demo seed registry coverage', () => {
  test('APPLICATION_TABLES matches every schema.ts *Schema export', ({ assert }) => {
    const schemaExports = Object.keys(schema)
      .filter((k) => k.endsWith('Schema'))
      .sort()
    const mapped = schemaExports.map((name) => {
      const table = SCHEMA_CLASS_TO_TABLE[name]
      assert.exists(table, `Add SCHEMA_CLASS_TO_TABLE mapping for ${name}`)
      return table
    })

    assert.deepEqual([...mapped].sort(), [...APPLICATION_TABLES].sort())
  })

  test('registry owns each application table exactly once', ({ assert }) => {
    assert.doesNotThrow(() => assertRegistryCoverage())
    assert.lengthOf(allOwnedTables(), APPLICATION_TABLES.length)
  })
})
