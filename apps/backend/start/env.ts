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

  WHATSAPP_VERIFY_TOKEN: Env.schema.string(),

  META_APP_SECRET: Env.schema.secret(),

  META_EMBEDDED_SIGNUP_CONFIG_ID: Env.schema.string(),

  META_APP_ID: Env.schema.string(),

  META_GRAPH_API_VERSION: Env.schema.string(),

  // Secrets only — model/debounce knobs live on platform_ai_configs.
  OPENAI_API_KEY: Env.schema.secret.optional(),
  GOOGLE_AI_API_KEY: Env.schema.secret.optional(),
  MISTRAL_API_KEY: Env.schema.secret.optional(),

  // Job queue — all jobs run on BullMQ (or null in tests). REDIS_URL required when driver=bullmq.
  JOB_QUEUE_DRIVER: Env.schema.enum.optional(['bullmq', 'null'] as const),
  JOB_QUEUE_BULLMQ_PREFIX: Env.schema.string.optional(),
  // Keep optional so NODE_ENV=test with null driver still boots; config asserts when bullmq.
  REDIS_URL: Env.schema.string.optional(),

  /** Platform hard cap for per-conversation AI generation rate (plan value is min'd with this). */
  AI_CONV_RATE_LIMIT_HARD_CAP: Env.schema.number.optional(),
  /** Platform hard cap for campaign dispatchRatePerSec (keeps headroom under Meta ~80 mps). */
  CAMPAIGN_DISPATCH_RATE_HARD_CAP: Env.schema.number.optional(),

  // Comma-separated hostnames allowed for outbound media public URLs (optional)
  OUTBOUND_MEDIA_ALLOWED_HOSTS: Env.schema.string.optional(),
  RAZORPAY_KEY_ID: Env.schema.string(),
  RAZORPAY_KEY_SECRET: Env.schema.secret(),
  RAZORPAY_WEBHOOK_SECRET: Env.schema.secret(),

  // Object storage: fs (Contabo disk) | s3 (S3-compatible / Contabo Object Storage)
  OBJECT_STORAGE_DRIVER: Env.schema.enum(['fs', 's3'] as const),
  DRIVE_DISK: Env.schema.enum(['fs', 's3'] as const),
  MEDIA_PUBLIC_BASE_URL: Env.schema.string({ format: 'url', tld: false }),
  /** Absolute path when OBJECT_STORAGE_DRIVER=fs */
  MEDIA_LOCAL_ROOT: Env.schema.string.optional(),
  // Required when OBJECT_STORAGE_DRIVER=s3 (validated in createObjectStorageFromEnv)
  S3_ACCESS_KEY_ID: Env.schema.string.optional(),
  S3_SECRET_ACCESS_KEY: Env.schema.secret.optional(),
  S3_REGION: Env.schema.string.optional(),
  S3_BUCKET: Env.schema.string.optional(),
  S3_ENDPOINT: Env.schema.string.optional(),
  S3_FORCE_PATH_STYLE: Env.schema.boolean.optional(),

  /**
   * Optional smoke-test only. When the mapped shopenup_* template is missing
   * or not approved, send this approved name instead (e.g. hello_world).
   * Unset after real templates are approved.
   */
  INTEGRATION_COMMERCE_TEMPLATE_FALLBACK: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | Variables for configuring the mail package
  |----------------------------------------------------------
  */
  MAIL_MAILER: Env.schema.enum(['smtp'] as const),
  MAIL_FROM_NAME: Env.schema.string(),
  MAIL_FROM_ADDRESS: Env.schema.string(),
  SMTP_HOST: Env.schema.string.optional(),
  SMTP_PORT: Env.schema.number.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.secret.optional(),
})
