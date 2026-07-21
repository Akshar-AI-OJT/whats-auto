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

//  Access context (frontend polls this after login/org switch)
router
  .get('/api/v1/access-context', [controllers.AccessContext, 'show'])
  .use([middleware.jwtAuth(), middleware.tenant()])

// roles
router
  .group(() => {
    router.get('/', [controllers.Roles, 'index'])
    router
      .post('/', [controllers.Roles, 'create'])
      .use(middleware.requirePermission({ permission: 'roles:create' }))
    router
      .post('/:roleKey/preview', [controllers.Roles, 'preview'])
      .use(middleware.requirePermission({ permission: 'roles:edit' }))
    router
      .put('/:roleKey', [controllers.Roles, 'update'])
      .use(middleware.requirePermission({ permission: 'roles:edit' }))
    router
      .delete('/:roleKey', [controllers.Roles, 'destroy'])
      .use(middleware.requirePermission({ permission: 'roles:delete' }))
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
