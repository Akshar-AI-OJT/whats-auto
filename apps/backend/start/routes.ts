/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { handleBetterAuth } from '#lib/handle_better_auth'
import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'
import AutoSwagger from 'adonis-autoswagger'
import swagger from '#config/swagger'
import env from '#start/env'
const AuthController = () => import('#controllers/auth_controller')
const PreSignupController = () => import('#controllers/pre_signup_controller')
const VerifySignupController = () => import('#controllers/verify_signup_controller')
const ContactsController = () => import('#controllers/contacts_controller')
const TagsController = () => import('#controllers/tags_controller')
const CampaignsController = () => import('#controllers/campaigns_controller')
const ConversationsController = () => import('#controllers/conversations_controller')
const OrganizationsController = () => import('#controllers/organizations_controller')
const InvitationsController = () => import('#controllers/invitations_controller')
const OnboardingController = () => import('#controllers/onboarding_controller')
const SuperAdminOrganizationsController = () =>
  import('#controllers/super_admin_organizations_controller')
const SuperAdminSubscriptionsController = () =>
  import('#controllers/super_admin_subscriptions_controller')
const SuperAdminPlansController = () => import('#controllers/super_admin_plans_controller')
const SuperAdminInvoicesController = () => import('#controllers/super_admin_invoices_controller')
const SuperAdminAiConfigController = () => import('#controllers/super_admin_ai_config_controller')
const SuperAdminAuditController = () => import('#controllers/super_admin_audit_controller')
const OrganizationAdminUsersController = () =>
  import('#controllers/organization_admin_users_controller')
const WhatsappWebhookController = () => import('#controllers/whatsapp_webhook_controller')
const WhatsappEmbeddedSignupController = () =>
  import('#controllers/whatsapp_embedded_signup_controller')
const WhatsappConfigsController = () => import('#controllers/whatsapp_configs_controller')
const MessageTemplatesController = () => import('#controllers/message_templates_controller')
const MessagesController = () => import('#controllers/messages_controller')
const ConversationAiController = () => import('#controllers/conversation_ai_controller')
const ConversationNotesController = () => import('#controllers/conversation_notes_controller')
const MediaUploadsController = () => import('#controllers/media_uploads_controller')
const MediaAssetsController = () => import('#controllers/media_assets_controller')
const KnowledgeDocumentsController = () => import('#controllers/knowledge_documents_controller')
const BillingController = () => import('#controllers/billing_controller')
const BillingRazorpayWebhookController = () =>
  import('#controllers/billing_razorpay_webhook_controller')
const InboxEventsController = () => import('#controllers/inbox_events_controller')
const NotificationsController = () => import('#controllers/notifications_controller')
const ApiKeysController = () => import('#controllers/api_keys_controller')
const IntegrationConnectionsController = () =>
  import('#controllers/integration_connections_controller')
const ExternalEventsController = () => import('#controllers/external_events_controller')
const ShopenupIntegrationsController = () => import('#controllers/shopenup_integrations_controller')

type JsonSchema = {
  type: 'object'
  properties: Record<string, Record<string, unknown>>
  required?: string[]
}

const bodySchema = (properties: JsonSchema['properties'], required?: string[]): JsonSchema => ({
  type: 'object',
  properties,
  ...(required ? { required } : {}),
})

// adonis-autoswagger currently emits empty application/json request bodies for
// inline examples. Explicit schemas keep every body-based endpoint executable
// from Swagger UI.
const requestBodySchemas: Record<string, JsonSchema> = {
  'post /api/auth/sign-in/email': bodySchema(
    {
      email: { type: 'string', format: 'email', example: 'krishna@example.com' },
      password: { type: 'string', format: 'password', example: 'secret1234' },
    },
    ['email', 'password']
  ),
  'post /api/v1/auth/pre-signup': bodySchema(
    {
      firstname: { type: 'string', example: 'Krishna' },
      lastname: { type: 'string', example: 'Patel' },
      email: { type: 'string', format: 'email', example: 'krishna@example.com' },
      password: { type: 'string', format: 'password', example: 'secret1234' },
    },
    ['firstname', 'lastname', 'email', 'password']
  ),
  'post /api/v1/auth/pre-signup/resend': bodySchema(
    { email: { type: 'string', format: 'email', example: 'krishna@example.com' } },
    ['email']
  ),
  'post /api/v1/auth/verify-signup': bodySchema(
    {
      email: { type: 'string', format: 'email', example: 'krishna@example.com' },
      otp: { type: 'string', pattern: '^\\d{6}$', example: '123456' },
      password: { type: 'string', format: 'password', example: 'secret1234' },
    },
    ['email', 'otp', 'password']
  ),
  'post /api/v1/organizations': bodySchema(
    {
      name: { type: 'string', example: 'Krishna Demo Company' },
      slug: { type: 'string', example: 'krishna-demo-company' },
      email: { type: 'string', format: 'email', example: 'ops@krishnademo.com' },
      phone: { type: 'string', example: '+919876543210' },
      website: { type: 'string', format: 'uri', example: 'https://krishnademo.com' },
      industry: { type: 'string', example: 'Software' },
      country: { type: 'string', example: 'IN' },
      timezone: { type: 'string', example: 'Asia/Kolkata' },
      currency: { type: 'string', example: 'INR' },
    },
    ['name', 'slug', 'email', 'country', 'timezone']
  ),
  'patch /api/v1/organizations/{id}': bodySchema({
    name: { type: 'string', example: 'Krishna Demo Company Updated' },
    phone: { type: 'string', example: '+919876543210' },
    website: { type: 'string', format: 'uri', example: 'https://krishnademo.com' },
    industry: { type: 'string', example: 'Software' },
    timezone: { type: 'string', example: 'Asia/Kolkata' },
    currency: { type: 'string', example: 'INR' },
  }),
  'post /api/v1/organizations/{id}/invitations': bodySchema(
    {
      email: { type: 'string', format: 'email', example: 'agent@example.com' },
      role: { type: 'string', example: 'agent' },
    },
    ['email', 'role']
  ),
  'patch /api/v1/organization-admin/users/{id}': bodySchema({
    firstname: { type: 'string', example: 'Ada' },
    lastname: { type: 'string', example: 'Agent' },
    email: { type: 'string', format: 'email', example: 'agent@example.com' },
    isActive: { type: 'boolean', example: true },
  }),
  'patch /api/v1/super-admin/organizations/{id}': bodySchema({
    name: { type: 'string', example: 'Acme Updated' },
    phone: { type: 'string', example: '+15550100' },
    website: { type: 'string', format: 'uri', example: 'https://acme.com' },
    industry: { type: 'string', example: 'Software' },
    timezone: { type: 'string', example: 'UTC' },
    currency: { type: 'string', example: 'USD' },
  }),
  'post /api/v1/super-admin/subscriptions': bodySchema(
    {
      organizationId: { type: 'string', format: 'uuid' },
      planId: { type: 'string', format: 'uuid' },
      status: { type: 'string', example: 'active' },
      currentPeriodStart: { type: 'string', format: 'date-time' },
      currentPeriodEnd: { type: 'string', format: 'date-time' },
    },
    ['organizationId', 'planId', 'status', 'currentPeriodStart', 'currentPeriodEnd']
  ),
  'patch /api/v1/super-admin/subscriptions/{id}': bodySchema({
    planId: { type: 'string', format: 'uuid' },
    status: { type: 'string', example: 'past_due' },
    currentPeriodStart: { type: 'string', format: 'date-time' },
    currentPeriodEnd: { type: 'string', format: 'date-time' },
  }),
  'post /api/v1/super-admin/invoices': bodySchema(
    {
      organizationId: { type: 'string', format: 'uuid' },
      planName: { type: 'string', example: 'Growth' },
      billingPeriod: { type: 'string', example: 'monthly' },
      periodStart: { type: 'string', format: 'date-time' },
      periodEnd: { type: 'string', format: 'date-time' },
      issueDate: { type: 'string', format: 'date' },
      dueDate: { type: 'string', format: 'date' },
      organizationName: { type: 'string', example: 'Acme Corp' },
      organizationEmail: { type: 'string', format: 'email' },
      lineItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unitPrice: { type: 'number' },
            amount: { type: 'number' },
          },
        },
      },
    },
    [
      'organizationId',
      'planName',
      'billingPeriod',
      'periodStart',
      'periodEnd',
      'issueDate',
      'dueDate',
      'organizationName',
      'organizationEmail',
      'lineItems',
    ]
  ),
  'post /api/v1/super-admin/invoices/{id}/mark-paid': bodySchema({
    paymentMethod: { type: 'string', example: 'Manual' },
    paymentTransactionId: { type: 'string', format: 'uuid' },
  }),
  'patch /api/v1/super-admin/ai-config': bodySchema({
    isEnabled: { type: 'boolean', example: true },
    chatProvider: { type: 'string', example: 'openai' },
    chatModel: { type: 'string', example: 'gpt-4o-mini' },
    summaryModel: { type: 'string', example: 'gpt-4o-mini' },
    modelName: { type: 'string', example: 'gpt-4o-mini' },
    temperature: { type: 'number', example: 0.2 },
    campaignAttributionWindowHours: { type: 'integer', example: 48 },
    minConfidenceScore: { type: 'number', example: 0.7 },
    debounceDelaySeconds: { type: 'integer', example: 4 },
    systemPrompt: { type: 'string', example: 'You are a grounded support agent.' },
    handoverKeywords: {
      type: 'array',
      items: { type: 'string' },
      example: ['agent', 'human', 'representative'],
    },
    workingSetSize: { type: 'integer', example: 6 },
    summaryTurnThreshold: { type: 'integer', example: 10 },
    embeddingProvider: { type: 'string', example: 'openai' },
    embeddingModel: { type: 'string', example: 'text-embedding-3-small' },
    activeEmbeddingSpaceId: {
      type: 'string',
      example: 'openai:text-embedding-3-small:1024:v1',
    },
    maxOutputTokens: { type: 'integer', example: 1024 },
  }),
  'post /api/v1/ai/knowledge-documents': bodySchema(
    {
      title: { type: 'string', example: 'Store hours' },
      sourceType: {
        type: 'string',
        example: 'FILE_PDF',
        enum: ['FILE_PDF', 'FILE_DOCX', 'FILE_TXT'],
      },
      fileName: { type: 'string', example: 'policy.pdf' },
      mimeType: { type: 'string', example: 'application/pdf' },
      fileSize: { type: 'integer', example: 12480 },
    },
    ['title', 'sourceType', 'fileName', 'mimeType', 'fileSize']
  ),
  'post /api/v1/whatsapp/embedded-signup/complete': bodySchema(
    {
      code: { type: 'string', example: 'AQB...' },
      wabaId: { type: 'string', example: '123' },
      phoneNumberId: { type: 'string', example: '456' },
    },
    ['code', 'wabaId', 'phoneNumberId']
  ),
  'post /api/v1/whatsapp/configs/{id}/test': bodySchema(
    {
      to: { type: 'string', example: '919876543210' },
      templateName: { type: 'string', example: 'hello_world' },
      languageCode: { type: 'string', example: 'en_US' },
    },
    ['to']
  ),
  'post /api/v1/contacts': bodySchema({ phone: { type: 'string', example: '+919876543210' } }, [
    'phone',
  ]),
  'post /api/v1/tags': bodySchema(
    {
      name: { type: 'string', example: 'VIP' },
      color: { type: 'string', example: '#22C55E', nullable: true },
      description: { type: 'string', example: 'Wholesale buyers', nullable: true },
    },
    ['name']
  ),
  'patch /api/v1/tags/{id}': bodySchema({
    name: { type: 'string', example: 'Wholesale' },
    color: { type: 'string', example: '#000000', nullable: true },
    description: { type: 'string', example: 'B2B accounts', nullable: true },
    status: { type: 'string', example: 'active', enum: ['active', 'inactive'] },
  }),
  'post /api/v1/tags/{id}/contacts': bodySchema({ contactId: { type: 'string', format: 'uuid' } }, [
    'contactId',
  ]),
  'post /api/v1/campaigns': bodySchema(
    {
      name: { type: 'string', example: 'July Product Launch' },
      whatsappConfigId: { type: 'string', format: 'uuid' },
      messageTemplateId: { type: 'string', format: 'uuid' },
      scheduledAt: { type: 'string', format: 'date-time', example: '2026-08-07T10:00:00.000Z' },
      status: { type: 'string', example: 'draft', enum: ['draft', 'scheduled'] },
    },
    ['name']
  ),
  'post /api/v1/campaigns/{id}/preview': bodySchema({
    variables: {
      type: 'object',
      additionalProperties: { type: 'string' },
      example: { customer_name: 'Priya' },
    },
  }),
  'post /api/v1/campaigns/{id}/schedule': bodySchema(
    {
      scheduledAt: {
        type: 'string',
        format: 'date-time',
        example: '2026-08-07T10:00:00.000Z',
      },
    },
    ['scheduledAt']
  ),
  'patch /api/v1/campaigns/{id}/status': bodySchema(
    {
      status: {
        type: 'string',
        example: 'sent',
        enum: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'],
      },
    },
    ['status']
  ),
  'patch /api/v1/campaigns/{id}': bodySchema({
    name: { type: 'string', example: 'July Product Launch v2' },
    whatsappConfigId: { type: 'string', format: 'uuid', nullable: true },
    messageTemplateId: { type: 'string', format: 'uuid', nullable: true },
    scheduledAt: {
      type: 'string',
      format: 'date-time',
      example: '2026-08-07T10:00:00.000Z',
      nullable: true,
    },
    status: { type: 'string', example: 'scheduled', enum: ['draft', 'scheduled'] },
  }),
  'put /api/v1/campaigns/{id}/recipients': bodySchema({
    contactIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      example: ['00000000-0000-0000-0000-000000000001'],
    },
    tagId: { type: 'string', format: 'uuid' },
    variables: {
      type: 'object',
      additionalProperties: { type: 'string' },
      example: { customer_name: 'Priya' },
    },
  }),
  'post /api/v1/inbox/conversations': bodySchema(
    {
      contactId: { type: 'string', format: 'uuid' },
      whatsappConfigId: { type: 'string', format: 'uuid' },
    },
    ['contactId', 'whatsappConfigId']
  ),
  'patch /api/v1/inbox/conversations/{id}': bodySchema({
    status: { type: 'string', example: 'pending', enum: ['open', 'pending', 'closed'] },
  }),
  'post /api/v1/inbox/conversations/{id}/assign': bodySchema(
    { assignedAgentId: { type: 'string', format: 'uuid' } },
    ['assignedAgentId']
  ),
  'post /api/v1/inbox/conversations/{id}/messages': bodySchema(
    {
      contentType: {
        type: 'string',
        example: 'text',
        enum: ['text', 'image', 'template'],
      },
      contentText: { type: 'string', example: 'Hello!' },
      mediaAssetId: { type: 'string', format: 'uuid' },
    },
    ['contentType']
  ),
  'post /api/v1/inbox/conversations/{id}/notes': bodySchema(
    { noteText: { type: 'string', example: 'Customer called about order #104' } },
    ['noteText']
  ),
  'patch /api/v1/members/{memberId}/role': bodySchema(
    { role: { type: 'string', example: 'agent' } },
    ['role']
  ),
  'post /api/v1/ownership/transfer': bodySchema(
    {
      targetMemberId: { type: 'string', format: 'uuid' },
      replacementRoleForCurrentOwner: { type: 'string', example: 'admin' },
      reason: { type: 'string', example: 'Ownership transfer' },
    },
    ['targetMemberId', 'replacementRoleForCurrentOwner']
  ),
  'post /api/v1/roles': bodySchema(
    {
      name: { type: 'string', example: 'Support Lead' },
      permissions: {
        type: 'array',
        items: { type: 'string' },
        example: ['inbox:view', 'inbox:reply', 'team:view'],
      },
    },
    ['name', 'permissions']
  ),
  'post /api/v1/roles/{roleKey}/preview': bodySchema(
    {
      permissions: {
        type: 'array',
        items: { type: 'string' },
        example: ['inbox:view', 'contacts:view'],
      },
    },
    ['permissions']
  ),
  'put /api/v1/roles/{roleKey}': bodySchema(
    {
      permissions: {
        type: 'array',
        items: { type: 'string' },
        example: ['inbox:view', 'inbox:reply'],
      },
      reason: { type: 'string', example: 'Update role permissions' },
    },
    ['permissions']
  ),
  'post /api/v1/roles/{roleKey}/reset': bodySchema({
    reason: { type: 'string', example: 'Restore default permissions' },
  }),
  'delete /api/v1/roles/{roleKey}': bodySchema(
    {
      replacementRole: { type: 'string', example: 'viewer' },
      reason: { type: 'string', example: 'Consolidating roles' },
    },
    ['replacementRole']
  ),
  'post /api/v1/api-keys': bodySchema(
    {
      name: { type: 'string', example: 'Shopenup Production' },
      scopes: {
        type: 'array',
        items: { type: 'string' },
        example: ['events:write'],
      },
    },
    ['name']
  ),
  'put /api/v1/integrations/{provider}': bodySchema(
    {
      displayName: { type: 'string', example: 'Shopenup Production' },
      externalAccountId: { type: 'string', example: 'store_1' },
      config: {
        type: 'object',
        example: { storeUrl: 'https://shop.example.com' },
      },
    },
    ['displayName']
  ),
  'post /api/v1/integrations/events': bodySchema(
    {
      externalEventId: { type: 'string', example: 'crm_1' },
      type: { type: 'string', example: 'crm.contact_upserted' },
      occurredAt: { type: 'string', example: '2026-08-17T12:00:00.000Z' },
      payload: { type: 'object', example: { phone: '+919999999999' } },
    },
    ['externalEventId', 'type', 'occurredAt', 'payload']
  ),
  'post /api/v1/integrations/shopenup/events': bodySchema(
    {
      eventType: { type: 'string', example: 'order.placed' },
      timestamp: { type: 'string', example: '2026-08-17T12:00:00.000Z' },
      data: {
        type: 'object',
        example: { orderId: 'ord_1', isCod: true, customerPhone: '+919999999999' },
      },
    },
    ['eventType', 'data']
  ),
}

//  Swagger UI + JSON spec
// Served only in non-production environments
router.get('/swagger', async ({ response }) => {
  const spec = await AutoSwagger.default.json(router.toJSON(), swagger)

  // A @tag annotation is appended once per operation, but OpenAPI requires unique tag names.
  const tags = spec.tags as { name: string }[]
  spec.tags = [...new Map(tags.map((tag) => [tag.name, tag])).values()]

  for (const [operationKey, schema] of Object.entries(requestBodySchemas)) {
    const separator = operationKey.indexOf(' ')
    const method = operationKey.slice(0, separator)
    const path = operationKey.slice(separator + 1)
    const operation = spec.paths?.[path]?.[method]

    if (operation) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema } },
      }
    }
  }

  return response.json(spec)
})

router.get('/docs', async () => {
  return AutoSwagger.default.ui('/swagger', swagger)
})

router.get('/', () => {
  return { hello: 'world' }
})

/**
 * Invite emails historically pointed at APP_URL (API). Redirect to the frontend
 * accept page so old links keep working.
 */
router.get('/accept-invitation/:id', async ({ params, response }) => {
  const frontend = env.get('CORS_ORIGIN').replace(/\/$/, '')
  return response.redirect(`${frontend}/accept-invitation/${params.id}`)
})

// better-auth handles /api/auth/* (login, OAuth, forgot/reset password, session, etc.)
router.post('/api/auth/sign-in/email', [AuthController, 'signInEmail'])
router.post('/api/auth/sign-out', [AuthController, 'signOut'])
router.get('/api/auth/get-session', [AuthController, 'getSession'])
router.get('/api/auth/token', [AuthController, 'token'])
router.get('/api/auth/jwks', [AuthController, 'jwks'])

router.any('/api/auth/*', async (ctx) => {
  return handleBetterAuth(ctx)
})

/*
|--------------------------------------------------------------------------
| Platform inbound webhooks (public â€” Meta / future providers)
| No jwtAuth / tenant. Auth = verify token (GET) + HMAC signature (POST).
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router.get('/whatsapp', [WhatsappWebhookController, 'verify'])
    router.post('/whatsapp', [WhatsappWebhookController, 'receive'])
    router.post('/billing/razorpay', [BillingRazorpayWebhookController, 'receive'])
  })
  .prefix('/api/v1/webhooks')

/*
|--------------------------------------------------------------------------
| Public integration ingress (API key — no jwtAuth / tenant)
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router.post('/events', [ExternalEventsController, 'store'])
    router.post('/shopenup/events', [ShopenupIntegrationsController, 'store'])
  })
  .prefix('/api/v1/integrations')
  .use([
    middleware.rateLimit({ max: 120, windowMs: 60 * 1000, name: 'integration-events' }),
    middleware.apiKeyAuth(),
  ])

/*
|--------------------------------------------------------------------------
| Tenant WhatsApp product APIs (Phase 2+)
| Embedded Signup + whatsapp_configs â€” jwtAuth + tenant + whatsapp:* perms
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router.get('/embedded-signup/session', [WhatsappEmbeddedSignupController, 'session'])
    router.post('/embedded-signup/complete', [WhatsappEmbeddedSignupController, 'complete'])

    router.get('/configs', [WhatsappConfigsController, 'index'])
    router.get('/configs/:id', [WhatsappConfigsController, 'show'])
    router.delete('/configs/:id', [WhatsappConfigsController, 'destroy'])
    router.post('/configs/:id/test', [WhatsappConfigsController, 'test'])

    router.get('/templates', [MessageTemplatesController, 'index'])
    router.get('/templates/:id', [MessageTemplatesController, 'show'])
    router.post('/templates', [MessageTemplatesController, 'store'])
    router.post('/templates/sync', [MessageTemplatesController, 'sync'])
    router.delete('/templates/:id', [MessageTemplatesController, 'destroy'])
  })
  .prefix('/api/v1/whatsapp')
  .use([middleware.jwtAuth(), middleware.tenant()])

router
  .group(() => {
    router
      .post('pre-signup', [PreSignupController, 'handle'])
      .use(middleware.rateLimit({ max: 5, windowMs: 15 * 60 * 1000, name: 'pre-signup' }))
    router
      .post('pre-signup/resend', [PreSignupController, 'resend'])
      .use(middleware.rateLimit({ max: 5, windowMs: 15 * 60 * 1000, name: 'pre-signup-resend' }))
    router
      .post('verify-signup', [VerifySignupController, 'handle'])
      .use(middleware.rateLimit({ max: 10, windowMs: 15 * 60 * 1000, name: 'verify-signup' }))
  })
  .prefix('/api/v1/auth')

router
  .group(() => {
    router.get('profile', [controllers.Profile, 'show'])
  })
  .prefix('/api/v1/account')
  .use(middleware.jwtAuth())

// super admin — platform scope (no active organization required)
router
  .group(() => {
    router.get('/organizations', [SuperAdminOrganizationsController, 'index'])
    router.patch('/organizations/:id', [SuperAdminOrganizationsController, 'update'])
    router.delete('/organizations/:id', [SuperAdminOrganizationsController, 'softDelete'])

    router.get('/subscriptions', [SuperAdminSubscriptionsController, 'index'])
    router.post('/subscriptions', [SuperAdminSubscriptionsController, 'store'])
    router.get('/subscriptions/:id', [SuperAdminSubscriptionsController, 'show'])
    router.patch('/subscriptions/:id', [SuperAdminSubscriptionsController, 'update'])
    router.delete('/subscriptions/:id', [SuperAdminSubscriptionsController, 'softDelete'])

    router.get('/plans', [SuperAdminPlansController, 'index'])
    router.post('/plans', [SuperAdminPlansController, 'store'])
    router.get('/plans/:id', [SuperAdminPlansController, 'show'])
    router.patch('/plans/:id', [SuperAdminPlansController, 'update'])
    router.delete('/plans/:id', [SuperAdminPlansController, 'softDelete'])

    router.get('/invoices/summary', [SuperAdminInvoicesController, 'summary'])
    router.get('/invoices', [SuperAdminInvoicesController, 'index'])
    router.post('/invoices', [SuperAdminInvoicesController, 'store'])
    router.get('/invoices/:id', [SuperAdminInvoicesController, 'show'])
    router.post('/invoices/:id/mark-paid', [SuperAdminInvoicesController, 'markPaid'])
    router.post('/invoices/:id/regenerate', [SuperAdminInvoicesController, 'regenerate'])
    router.post('/invoices/:id/send', [SuperAdminInvoicesController, 'send'])
    router.get('/invoices/:id/download', [SuperAdminInvoicesController, 'download'])

    router.get('/ai-config', [SuperAdminAiConfigController, 'show'])
    router.patch('/ai-config', [SuperAdminAiConfigController, 'update'])
    router.get('/audit-logs', [SuperAdminAuditController, 'index'])
  })
  .prefix('/api/v1/super-admin')
  .use([middleware.jwtAuth(), middleware.platform()])

// organization admin — active-org scoped (admin/owner role enforced via OrganizationAdminUserPolicy)
router
  .group(() => {
    router.get('/users', [OrganizationAdminUsersController, 'index'])
    router.get('/users/:id', [OrganizationAdminUsersController, 'show'])
    router.patch('/users/:id', [OrganizationAdminUsersController, 'update'])
    router.delete('/users/:id', [OrganizationAdminUsersController, 'softDelete'])
  })
  .prefix('/api/v1/organization-admin')
  .use([middleware.jwtAuth(), middleware.tenant()])

// organizations — create/list/set-active do not require an active org yet
router.post('/api/v1/organizations', [OrganizationsController, 'store']).use([middleware.jwtAuth()])
router.get('/api/v1/organizations', [OrganizationsController, 'index']).use([middleware.jwtAuth()])
router
  .post('/api/v1/organizations/:id/set-active', [OrganizationsController, 'setActive'])
  .use([middleware.jwtAuth()])

router
  .group(() => {
    router.patch('/:id', [OrganizationsController, 'update'])
    router.delete('/:id', [OrganizationsController, 'destroy'])
    router.post('/:id/invitations', [InvitationsController, 'store'])
  })
  .prefix('/api/v1/organizations')
  .use([middleware.jwtAuth(), middleware.tenant()])

// invitations — list stays active-org scoped; accept/reject/cancel use invitation :id
router
  .get('/api/v1/invitations', [InvitationsController, 'index'])
  .use([middleware.jwtAuth(), middleware.tenant()])

router.get('/api/v1/invitations/:id', [InvitationsController, 'show'])
router
  .post('/api/v1/invitations/:id/accept', [InvitationsController, 'accept'])
  .use([middleware.jwtAuth()])
// Public decline — invitation id is the secret (same as preview)
router.post('/api/v1/invitations/:id/reject', [InvitationsController, 'reject'])
router
  .post('/api/v1/invitations/:id/cancel', [InvitationsController, 'cancel'])
  .use([middleware.jwtAuth(), middleware.tenant()])

//  Access context (frontend polls this after login/org switch)
router
  .get('/api/v1/access-context', [controllers.AccessContext, 'show'])
  .use([middleware.jwtAuth(), middleware.tenant()])

// Onboarding state — no active org required; tells the client which screen comes next
router.get('/api/v1/onboarding/state', [OnboardingController, 'show']).use([middleware.jwtAuth()])

// roles
router
  .group(() => {
    router.get('/', [controllers.Roles, 'index'])
    router.post('/', [controllers.Roles, 'create'])
    router.post('/:roleKey/preview', [controllers.Roles, 'preview'])
    router.put('/:roleKey', [controllers.Roles, 'update'])
    router.post('/:roleKey/reset', [controllers.Roles, 'reset'])
    router.delete('/:roleKey', [controllers.Roles, 'destroy'])
  })
  .prefix('/api/v1/roles')
  .use([middleware.jwtAuth(), middleware.tenant()])

// members
router
  .group(() => {
    // Team UI lists members here; org-admin/users is the paginated Owner/Admin admin API.
    router.get('/', [controllers.Members, 'index'])
    router.patch('/:memberId/role', [controllers.Members, 'assignRole'])
    router.delete('/:memberId', [controllers.Members, 'remove'])
  })
  .prefix('/api/v1/members')
  .use([middleware.jwtAuth(), middleware.tenant()])

// ownership transfer
router
  .post('/api/v1/ownership/transfer', [controllers.Ownership, 'transfer'])
  .use([middleware.jwtAuth(), middleware.tenant()])

// audit history — tenant-scoped (audit:view). Super Admin uses /api/v1/super-admin/audit-logs.
router
  .get('/api/v1/audit', [controllers.Audit, 'index'])
  .use([middleware.jwtAuth(), middleware.tenant()])

// contacts — tenant isolation
router
  .group(() => {
    router.get('/', [ContactsController, 'index'])
    router.post('/', [ContactsController, 'store'])
  })
  .prefix('/api/v1/contacts')
  .use([middleware.jwtAuth(), middleware.tenant()])

// contact tags — grouping via existing tags / contact_tags tables
router
  .group(() => {
    router.get('/', [TagsController, 'index'])
    router.post('/', [TagsController, 'store'])
    router.get('/:id/contacts', [TagsController, 'contacts'])
    router.post('/:id/contacts', [TagsController, 'assignContact'])
    router.delete('/:id/contacts/:contactId', [TagsController, 'removeContact'])
    router.get('/:id', [TagsController, 'show'])
    router.patch('/:id', [TagsController, 'update'])
    router.delete('/:id', [TagsController, 'destroy'])
  })
  .prefix('/api/v1/tags')
  .use([middleware.jwtAuth(), middleware.tenant()])

// tenant API keys — hashed secrets for public integration ingress
router
  .group(() => {
    router.get('/', [ApiKeysController, 'index'])
    router.post('/', [ApiKeysController, 'store'])
    router.post('/:id/revoke', [ApiKeysController, 'revoke'])
  })
  .prefix('/api/v1/api-keys')
  .use([middleware.jwtAuth(), middleware.tenant()])

// tenant integration connections — v1 Shopenup only
router
  .group(() => {
    router.get('/', [IntegrationConnectionsController, 'index'])
    router.get('/:provider', [IntegrationConnectionsController, 'show'])
    router.put('/:provider', [IntegrationConnectionsController, 'upsert'])
    router.delete('/:provider', [IntegrationConnectionsController, 'destroy'])
  })
  .prefix('/api/v1/integrations')
  .use([middleware.jwtAuth(), middleware.tenant()])

// media uploads — direct-to-S3 pending → ready lifecycle + Media Library
router
  .group(() => {
    router.get('/', [MediaAssetsController, 'index'])
    router.get('/quota', [MediaAssetsController, 'quota'])
    router.get('/:id', [MediaAssetsController, 'show'])
    router.post('/uploads', [MediaUploadsController, 'store'])
    router.post('/uploads/:id/complete', [MediaUploadsController, 'complete'])
    router.delete('/:id', [MediaAssetsController, 'destroy'])
    router.post('/:id/restore', [MediaAssetsController, 'restore'])
    router.post('/:id/purge', [MediaAssetsController, 'purge'])
  })
  .prefix('/api/v1/media')
  .use([middleware.jwtAuth(), middleware.tenant()])

// AI knowledge base — files live in the knowledge_base S3 namespace
router
  .group(() => {
    router.get('/', [KnowledgeDocumentsController, 'index'])
    router.post('/', [KnowledgeDocumentsController, 'store'])
    router.get('/:id', [KnowledgeDocumentsController, 'show'])
    router.post('/:id/complete-upload', [KnowledgeDocumentsController, 'completeUpload'])
    router.delete('/:id', [KnowledgeDocumentsController, 'destroy'])
    router.post('/:id/restore', [KnowledgeDocumentsController, 'restore'])
    router.post('/:id/purge', [KnowledgeDocumentsController, 'purge'])
  })
  .prefix('/api/v1/ai/knowledge-documents')
  .use([middleware.jwtAuth(), middleware.tenant()])

// campaigns — outbound broadcasts (product: Campaign)
router
  .group(() => {
    router.get('/', [CampaignsController, 'index'])
    router.post('/:id/preview', [CampaignsController, 'preview'])
    router.post('/:id/send', [CampaignsController, 'send'])
    router.post('/:id/schedule', [CampaignsController, 'schedule'])
    router.patch('/:id/cancel', [CampaignsController, 'cancel'])
    router.post('/:id/duplicate', [CampaignsController, 'duplicate'])
    router.patch('/:id/status', [CampaignsController, 'changeStatus'])
    router.get('/:id', [CampaignsController, 'show'])
    router.post('/', [CampaignsController, 'store'])
    router.patch('/:id', [CampaignsController, 'update'])
    router.put('/:id/recipients', [CampaignsController, 'replaceRecipients'])
    router.delete('/:id', [CampaignsController, 'softDelete'])
  })
  .prefix('/api/v1/campaigns')
  .use([middleware.jwtAuth(), middleware.tenant()])

// inbox realtime — SSE stream (must be registered before /conversations/:id)
router
  .get('/api/v1/inbox/events', [InboxEventsController, 'stream'])
  .use([middleware.jwtAuth(), middleware.tenant()])

// inbox conversations — lifecycle APIs
router
  .group(() => {
    router.get('/', [ConversationsController, 'index'])
    router.post('/', [ConversationsController, 'store'])
    router.get('/:id', [ConversationsController, 'show'])
    router.patch('/:id', [ConversationsController, 'update'])
    router.post('/:id/assign', [ConversationsController, 'assign'])
    router.post('/:id/close', [ConversationsController, 'close'])
    router.post('/:id/reopen', [ConversationsController, 'reopen'])
    router.get('/:id/messages', [MessagesController, 'index'])
    router.post('/:id/messages', [MessagesController, 'store'])
    router.post('/:id/ai/takeover', [ConversationAiController, 'takeover'])
    router.post('/:id/ai/resume', [ConversationAiController, 'resume'])
    router.get('/:id/notes', [ConversationNotesController, 'index'])
    router.post('/:id/notes', [ConversationNotesController, 'store'])
  })
  .prefix('/api/v1/inbox/conversations')
  .use([middleware.jwtAuth(), middleware.tenant()])

// Platform billing (tenant) — Razorpay SaaS checkout + subscription read
router
  .group(() => {
    router.get('/subscription', [BillingController, 'showSubscription'])
    router.post('/checkout', [BillingController, 'checkout'])
  })
  .prefix('/api/v1/billing')
  .use([middleware.jwtAuth(), middleware.tenant()])

// notifications — personal in-app feed (org + user scoped; not notifications:manage config)
router
  .group(() => {
    router.get('/', [NotificationsController, 'index'])
    // Static path before :id so "read-all" is not captured as an id
    router.patch('/read-all', [NotificationsController, 'markAllAsRead'])
    router.patch('/:id/read', [NotificationsController, 'markAsRead'])
  })
  .prefix('/api/v1/notifications')
  .use([middleware.jwtAuth(), middleware.tenant()])
