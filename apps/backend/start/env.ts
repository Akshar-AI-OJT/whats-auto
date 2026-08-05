/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Cors
  CORS_ORIGIN: Env.schema.string({ format: 'url', tld: false }),

  // Better Auth
  BETTER_AUTH_SECRET: Env.schema.secret(),
  BETTER_AUTH_URL: Env.schema.string({ format: 'url', tld: false }),

  JWT_ISSUER: Env.schema.string({ format: 'url', tld: false }),
  JWT_AUDIENCE: Env.schema.string(),
  JWT_ACCESS_TOKEN_TTL: Env.schema.string(),

  // Auth Provider
  GOOGLE_CLIENT_ID: Env.schema.string(),
  GOOGLE_CLIENT_SECRET: Env.schema.secret(),

  // Postgres
  PG_HOST: Env.schema.string(),
  PG_PORT: Env.schema.number(),
  PG_USER: Env.schema.string(),
  PG_PASSWORD: Env.schema.secret(),
  PG_DB_NAME: Env.schema.string(),
  PG_SSL: Env.schema.boolean.optional(),

  // Resend
  RESEND_API_KEY: Env.schema.secret(),
  EMAIL_FROM: Env.schema.string(),

  WHATSAPP_VERIFY_TOKEN: Env.schema.string(),

  META_APP_SECRET: Env.schema.secret(),

  META_EMBEDDED_SIGNUP_CONFIG_ID: Env.schema.string(),

  META_APP_ID: Env.schema.string(),

  META_GRAPH_API_VERSION: Env.schema.string(),

  // Job queue (pgboss | null; redis reserved for a future driver)
  JOB_QUEUE_DRIVER: Env.schema.enum.optional(['pgboss', 'null'] as const),
  JOB_QUEUE_PGBOSS_SCHEMA: Env.schema.string.optional(),

  // Comma-separated hostnames allowed for outbound media public URLs (optional)
  OUTBOUND_MEDIA_ALLOWED_HOSTS: Env.schema.string.optional(),
  RAZORPAY_KEY_ID: Env.schema.string(),
  RAZORPAY_KEY_SECRET: Env.schema.secret(),
  RAZORPAY_WEBHOOK_SECRET: Env.schema.secret(),
})
