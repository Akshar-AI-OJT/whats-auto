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
const PreSignupController = () => import('#controllers/pre_signup_controller')
const VerifySignupController = () => import('#controllers/verify_signup_controller')
const TenantsController = () => import('#controllers/tenants_controller')
const ContactsController = () => import('#controllers/contacts_controller')
const OrganizationsController = () => import('#controllers/organizations_controller')
const InvitationsController = () => import('#controllers/invitations_controller')
const SuperAdminOrganizationsController = () =>
  import('#controllers/super_admin_organizations_controller')

//  Swagger UI + JSON spec
// Served only in non-production environments
router.get('/swagger', async ({ response }) => {
  return response.send(await AutoSwagger.default.docs(router.toJSON(), swagger))
})

router.get('/docs', async () => {
  return AutoSwagger.default.ui('/swagger', swagger)
})

router.get('/', () => {
  return { hello: 'world' }
})

// better-auth handles /api/auth/* (login, OAuth, forgot/reset password, session, etc.)
router.any('/api/auth/*', async (ctx) => {
  return handleBetterAuth(ctx)
})

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
      .patch('/organizations/:id/soft-delete', [SuperAdminOrganizationsController, 'softDelete'])
      .use(middleware.requirePermission({ permission: 'platform:tenants_delete' }))
  })
  .prefix('/api/v1/super-admin')
  .use([middleware.jwtAuth(), middleware.platform()])

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
router
  .post('/api/v1/invitations/:id/reject', [InvitationsController, 'reject'])
  .use([middleware.jwtAuth()])
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

// tenants (organizations) — jwtAuth only; membership/owner checks live in TenantService
router
  .group(() => {
    router.post('/', [TenantsController, 'store'])
    router.get('/', [TenantsController, 'index'])
    router.get('/:id', [TenantsController, 'show'])
    router.put('/:id', [TenantsController, 'update'])
    router.delete('/:id', [TenantsController, 'destroy'])
  })
  .prefix('/api/v1/tenants')
  .use(middleware.jwtAuth())

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
