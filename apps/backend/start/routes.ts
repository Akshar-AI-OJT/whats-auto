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
const OrganizationsController = () => import('#controllers/organizations_controller')
const InvitationsController = () => import('#controllers/invitations_controller')
const OnboardingController = () => import('#controllers/onboarding_controller')
const SuperAdminOrganizationsController = () =>
  import('#controllers/super_admin_organizations_controller')
const SuperAdminSubscriptionsController = () =>
  import('#controllers/super_admin_subscriptions_controller')
const OrganizationAdminUsersController = () =>
  import('#controllers/organization_admin_users_controller')
const WhatsappWebhookController = () => import('#controllers/whatsapp_webhook_controller')
const WhatsappEmbeddedSignupController = () =>
  import('#controllers/whatsapp_embedded_signup_controller')
const WhatsappConfigsController = () => import('#controllers/whatsapp_configs_controller')
const MessageTemplatesController = () => import('#controllers/message_templates_controller')

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
| Platform inbound webhooks (public — Meta / future providers)
| No jwtAuth / tenant. Auth = verify token (GET) + HMAC signature (POST).
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router.get('/whatsapp', [WhatsappWebhookController, 'verify'])
    router.post('/whatsapp', [WhatsappWebhookController, 'receive'])
  })
  .prefix('/api/v1/webhooks')

/*
|--------------------------------------------------------------------------
| Tenant WhatsApp product APIs (Phase 2+)
| Embedded Signup + whatsapp_configs — jwtAuth + tenant + whatsapp:* perms
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router
      .get('/embedded-signup/session', [WhatsappEmbeddedSignupController, 'session'])
      .use(middleware.requirePermission({ permission: 'whatsapp:connect' }))
    router
      .post('/embedded-signup/complete', [WhatsappEmbeddedSignupController, 'complete'])
      .use(middleware.requirePermission({ permission: 'whatsapp:connect' }))

    router
      .get('/configs', [WhatsappConfigsController, 'index'])
      .use(middleware.requirePermission({ permission: 'whatsapp:view' }))
    router
      .get('/configs/:id', [WhatsappConfigsController, 'show'])
      .use(middleware.requirePermission({ permission: 'whatsapp:view' }))
    router
      .delete('/configs/:id', [WhatsappConfigsController, 'destroy'])
      .use(middleware.requirePermission({ permission: 'whatsapp:connect' }))
    router
      .post('/configs/:id/test', [WhatsappConfigsController, 'test'])
      .use(middleware.requirePermission({ permission: 'whatsapp:manage' }))

    router
      .get('/templates', [MessageTemplatesController, 'index'])
      .use(middleware.requirePermission({ permission: 'whatsapp:view' }))
    router
      .get('/templates/:id', [MessageTemplatesController, 'show'])
      .use(middleware.requirePermission({ permission: 'whatsapp:view' }))
    router
      .post('/templates', [MessageTemplatesController, 'store'])
      .use(middleware.requirePermission({ permission: 'whatsapp:manage' }))
    router
      .post('/templates/sync', [MessageTemplatesController, 'sync'])
      .use(middleware.requirePermission({ permission: 'whatsapp:manage' }))
    router
      .delete('/templates/:id', [MessageTemplatesController, 'destroy'])
      .use(middleware.requirePermission({ permission: 'whatsapp:manage' }))
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
    router
      .get('/organizations', [SuperAdminOrganizationsController, 'index'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_view' }))
    router
      .patch('/organizations/:id', [SuperAdminOrganizationsController, 'update'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_update' }))
    router
      .delete('/organizations/:id', [SuperAdminOrganizationsController, 'softDelete'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_delete' }))
    router
      .get('/subscriptions', [SuperAdminSubscriptionsController, 'index'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_billing' }))
    router
      .post('/subscriptions', [SuperAdminSubscriptionsController, 'store'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_billing' }))
    router
      .get('/subscriptions/:id', [SuperAdminSubscriptionsController, 'show'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_billing' }))
    router
      .patch('/subscriptions/:id', [SuperAdminSubscriptionsController, 'update'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_billing' }))
    router
      .delete('/subscriptions/:id', [SuperAdminSubscriptionsController, 'softDelete'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_billing' }))
  })
  .prefix('/api/v1/super-admin')
  .use([middleware.jwtAuth(), middleware.platform()])

// organization admin — active-org scoped (admin/owner role enforced in controller)
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
    router
      .patch('/:id', [OrganizationsController, 'update'])
      .use(middleware.requirePermission({ permission: 'org:settings_manage' }))
    router
      .delete('/:id', [OrganizationsController, 'destroy'])
      .use(middleware.requirePermission({ permission: 'org:delete' }))
    router
      .post('/:id/invitations', [InvitationsController, 'store'])
      .use(middleware.requirePermission({ permission: 'team:invite' }))
  })
  .prefix('/api/v1/organizations')
  .use([middleware.jwtAuth(), middleware.tenant()])

// invitations — list stays active-org scoped; accept/reject/cancel use invitation :id
router
  .get('/api/v1/invitations', [InvitationsController, 'index'])
  .use([
    middleware.jwtAuth(),
    middleware.tenant(),
    middleware.requirePermission({ permission: 'team:view' }),
  ])

router.get('/api/v1/invitations/:id', [InvitationsController, 'show'])
router
  .post('/api/v1/invitations/:id/accept', [InvitationsController, 'accept'])
  .use([middleware.jwtAuth()])
// Public decline — invitation id is the secret (same as preview)
router.post('/api/v1/invitations/:id/reject', [InvitationsController, 'reject'])
router
  .post('/api/v1/invitations/:id/cancel', [InvitationsController, 'cancel'])
  .use([
    middleware.jwtAuth(),
    middleware.tenant(),
    middleware.requirePermission({ permission: 'team:invite' }),
  ])

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
    router
      .post('/', [controllers.Roles, 'create'])
      .use(middleware.requirePermission({ permission: 'roles:manage' }))
    router
      .post('/:roleKey/preview', [controllers.Roles, 'preview'])
      .use(middleware.requirePermission({ permission: 'roles:manage' }))
    router
      .put('/:roleKey', [controllers.Roles, 'update'])
      .use(middleware.requirePermission({ permission: 'roles:manage' }))
    router
      .post('/:roleKey/reset', [controllers.Roles, 'reset'])
      .use(middleware.requirePermission({ permission: 'roles:manage' }))
    router
      .delete('/:roleKey', [controllers.Roles, 'destroy'])
      .use(middleware.requirePermission({ permission: 'roles:manage' }))
  })
  .prefix('/api/v1/roles')
  .use([
    middleware.jwtAuth(),
    middleware.tenant(),
    middleware.requirePermission({ permission: 'team:view' }),
  ])

//members
router
  .group(() => {
    // Team UI lists members here; org-admin/users is the paginated Owner/Admin admin API.
    router.get('/', [controllers.Members, 'index'])
    router
      .patch('/:memberId/role', [controllers.Members, 'assignRole'])
      .use(middleware.requirePermission({ permission: 'team:role_assign' }))
    router
      .delete('/:memberId', [controllers.Members, 'remove'])
      .use(middleware.requirePermission({ permission: 'team:remove' }))
  })
  .prefix('/api/v1/members')
  .use([
    middleware.jwtAuth(),
    middleware.tenant(),
    middleware.requirePermission({ permission: 'team:view' }),
  ])

//ownership transfer
router
  .post('/api/v1/ownership/transfer', [controllers.Ownership, 'transfer'])
  .use([middleware.jwtAuth(), middleware.tenant()])

//audit history
router
  .get('/api/v1/audit', [controllers.Audit, 'index'])
  .use([
    middleware.jwtAuth(),
    middleware.tenant(),
    middleware.requirePermission({ permission: 'team:view' }),
  ])

// contacts — sample RLS business table (tenant isolation demo)
router
  .group(() => {
    router
      .get('/', [ContactsController, 'index'])
      .use(middleware.requirePermission({ permission: 'contacts:view' }))
    router
      .post('/', [ContactsController, 'store'])
      .use(middleware.requirePermission({ permission: 'contacts:create' }))
  })
  .prefix('/api/v1/contacts')
  .use([middleware.jwtAuth(), middleware.tenant()])
