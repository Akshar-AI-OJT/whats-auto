import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

const frontendOrigin = env.get('CORS_ORIGIN').replace(/\/$/, '')

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  /**
   * Enable or disable CORS handling globally.
   */
  enabled: true,

  /**
   * Local/test: allow any origin (Next rewrite or direct :3333).
   * Production: browser calls Railway from the Vercel origin in CORS_ORIGIN.
   */
  origin: app.inProduction ? frontendOrigin : true,

  /**
   * HTTP methods accepted for cross-origin requests.
   */
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  /**
   * Reflect request headers by default. Use a string array to restrict
   * allowed headers.
   */
  headers: true,

  /**
   * Response headers exposed to the browser.
   * set-auth-jwt: Better Auth jwt plugin + remint helpers attach the access token.
   * Clear-Auth-Jwt: domain mutations that destroy the caller's active org scope.
   */
  exposeHeaders: ['set-auth-jwt', 'Clear-Auth-Jwt'],

  /**
   * Allow cookies/authorization headers on cross-origin requests.
   */
  credentials: true,

  /**
   * Cache CORS preflight response for N seconds.
   */
  maxAge: 90,
})

export default corsConfig
