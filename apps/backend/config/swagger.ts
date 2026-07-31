import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// ESM equivalent of DirName
const FileName = fileURLToPath(import.meta.url)
const DirName = dirname(FileName)

const swaggerConfig = {
  // Absolute path to project root (needed by adonis-autoswagger to read route files)
  // DirName is /config, so going one level up gives the backend root
  path: DirName + '/../',

  title: 'Whats-Auto API',
  version: '1.0.0',
  description: 'API documentation for the Whats-Auto WhatsApp automation platform',

  // Group routes by the Nth URL segment: /api/v1/[group]/... → segment 3
  tagIndex: 3,
  snakeCase: true,

  common: {
    parameters: {},
    headers: {},
  },

  securitySchemes: {
    BearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'Better Auth session token. Sign in via POST /api/auth/sign-in/email — the token is in the Set-Cookie header (better-auth.session_token) or the JSON body.',
    },
  },

  // Scheme name used when a route has auth middleware (see authMiddlewares)
  defaultSecurityScheme: 'BearerAuth',
  authMiddlewares: ['jwtAuth'],

  // Keep auth token in Swagger UI across page refreshes
  persistAuthorization: true,

  ignore: ['/swagger', '/docs', '/'],
}

export default swaggerConfig
