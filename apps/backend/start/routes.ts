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

// better-auth handles all /api/auth/* endpoints (signup, login, OTP, OAuth, etc.)
router.any('/api/auth/*', async (ctx) => {
  return handleBetterAuth(ctx)
})

router.post('/api/v1/auth/pre-signup', [PreSignupController, 'handle'])
router.post('/api/v1/auth/pre-signup/resend', [PreSignupController, 'resend'])
router.post('/api/v1/auth/verify-signup', [VerifySignupController, 'handle'])

router
  .group(() => {
    router.get('profile', [controllers.Profile, 'show'])
  })
  .prefix('/api/v1/account')
  .use(middleware.jwtAuth())
