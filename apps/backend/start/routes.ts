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
const PreSignupController = () => import('#controllers/pre_signup_controller')
const VerifySignupController = () => import('#controllers/verify_signup_controller')

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
