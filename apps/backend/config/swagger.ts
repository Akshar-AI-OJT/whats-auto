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
      description: [
        'JWT access token (EdDSA), verified against GET /api/auth/jwks.',
        '',
        'How to get one — all three steps are in this page:',
        '1. POST /api/auth/sign-in/email — sets the session cookie.',
        '2. POST /api/v1/organizations/{id}/set-active — pick the organization you want to act in.',
        '3. GET /api/auth/token — copy the "token" value and paste it below.',
        '',
        'The token freezes org_id, role and scope for the organization that was active',
        'at mint time. After another set-active you must mint a NEW token; the old one',
        'keeps reporting the previous organization until it expires.',
        '',
        'Do NOT paste the better-auth.session_token cookie value here. It is not a JWT,',
        'and because an invalid Bearer header never falls back to the cookie it will turn',
        'working requests into 401 INVALID_TOKEN.',
      ].join('\n'),
    },
  },

  // Scheme name used when a route has auth middleware (see authMiddlewares)
  defaultSecurityScheme: 'BearerAuth',
  authMiddlewares: ['jwtAuth'],

  // Keep auth token in Swagger UI across page refreshes
  persistAuthorization: true,

<<<<<<< HEAD
  // The last entry is a suffix match, so it hides only the better-auth catch-all route
  // itself and leaves the explicitly declared /api/auth/... endpoints documented.
  // A '/api/auth/' prefix entry would match those too and hide them.
  ignore: ['/swagger', '/docs', '/', '*/auth/*'],
=======
  ignore: ['/swagger', '/docs', '/'],
>>>>>>> feature/user-role
}

export default swaggerConfig
