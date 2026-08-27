## Staging / production: Railway (backend) & Vercel (frontend)

Local `next dev` still rewrites `/api/*` to Adonis on `:3333`. Deployed Vercel **does not** proxy. The browser calls Railway directly. Meta / Razorpay / Shopenup webhooks also hit Railway — not Vercel and not ngrok.

### Topology

- **Frontend (Vercel):** Next.js App Router.
- **HTTP API (Railway):** `node build/bin/server.js`.
- **Queue worker (Railway):** `node build/bin/worker.js` (private networking).
- **Postgres + Redis (Railway):** `pgvector` on Postgres; Redis for BullMQ + inbox SSE.

### Frontend (Vercel) environment

Set at **build** time (`NEXT_PUBLIC_*` is inlined):

| Variable              | Value                                  |
| --------------------- | -------------------------------------- |
| `NEXT_PUBLIC_API_URL` | Railway HTTP origin, no trailing slash |
| `NEXT_PUBLIC_APP_URL` | Vercel app origin, no trailing slash   |

Do **not** set `API_REWRITE_ORIGIN` on Vercel. Leave `NEXT_PUBLIC_API_URL` unset only for local `next dev`.

### Backend (Railway) environment

Names must match `apps/backend/start/env.ts`. Railway `DATABASE_URL` / `S3_KEY` are **not** read.

| Variable                                                                                                          | Staging / production value                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                                        | `production`                                                                 |
| `PORT`                                                                                                            | `3333` (or Railway’s injected port)                                          |
| `HOST`                                                                                                            | `0.0.0.0`                                                                    |
| `LOG_LEVEL`                                                                                                       | `info`                                                                       |
| `APP_KEY`                                                                                                         | Adonis secret (32+ chars)                                                    |
| `APP_URL`                                                                                                         | Railway HTTP origin                                                          |
| `SESSION_DRIVER`                                                                                                  | `cookie`                                                                     |
| `CORS_ORIGIN`                                                                                                     | Vercel app origin (browser origin; invite links; Better Auth trusted origin) |
| `BETTER_AUTH_SECRET`                                                                                              | 32+ chars                                                                    |
| `BETTER_AUTH_URL`                                                                                                 | Railway HTTP origin (`/api/auth/*` lives here)                               |
| `JWT_ISSUER`                                                                                                      | Railway HTTP origin                                                          |
| `JWT_AUDIENCE`                                                                                                    | `whats-auto-api`                                                             |
| `JWT_ACCESS_TOKEN_TTL`                                                                                            | `15m`                                                                        |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                                                       | Google OAuth app; callback `{BETTER_AUTH_URL}/api/auth/callback/google`      |
| `PG_HOST` `PG_PORT` `PG_USER` `PG_PASSWORD` `PG_DB_NAME`                                                          | Railway Postgres (map from `PGHOST` / `PGPORT` / …)                          |
| `PG_SSL`                                                                                                          | `true`                                                                       |
| `REDIS_URL`                                                                                                       | Railway Redis URL                                                            |
| `JOB_QUEUE_DRIVER`                                                                                                | `bullmq`                                                                     |
| `JOB_QUEUE_BULLMQ_PREFIX`                                                                                         | `wa:bullmq`                                                                  |
| `RESEND_API_KEY` / `EMAIL_FROM`                                                                                   | Transactional mail                                                           |
| `WHATSAPP_VERIFY_TOKEN` `META_APP_ID` `META_APP_SECRET` `META_EMBEDDED_SIGNUP_CONFIG_ID` `META_GRAPH_API_VERSION` | Meta app; webhook `{APP_URL}/api/v1/webhooks/whatsapp`                       |
| `OPENAI_API_KEY` `GOOGLE_AI_API_KEY` `MISTRAL_API_KEY`                                                            | Optional until platform AI is enabled                                        |
| `RAZORPAY_KEY_ID` `RAZORPAY_KEY_SECRET` `RAZORPAY_WEBHOOK_SECRET`                                                 | Billing; webhook `{APP_URL}/api/v1/webhooks/billing/razorpay`                |
| `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` `S3_REGION` `S3_BUCKET` `S3_ENDPOINT` | Contabo Object Storage (S3-compatible) |
| `S3_FORCE_PATH_STYLE`                                                                                             | `true` (required for Contabo)                                                    |
| `DRIVE_DISK`                                                                                                      | `s3`                                                                         |
| `MEDIA_PUBLIC_BASE_URL`                                                                                           | Contabo public base for media links, no trailing slash                       |
| `OUTBOUND_MEDIA_ALLOWED_HOSTS`                                                                                    | Contabo storage hostname only                                                |

Production CORS allowlist is `CORS_ORIGIN` (see `apps/backend/config/cors.ts`). Session cookies use `SameSite=None; Secure` so the Vercel origin can send them to Railway.

### Railway services

1. **HTTP:** root `apps/backend`, build `pnpm build` (`node ace build`), start `node build/bin/server.js`. Node **>= 24**.
2. **Worker:** same root/build, start `node build/bin/worker.js`.

Monorepo install must see the repo-root `pnpm-workspace.yaml` / lockfile. Prefer building from the workspace (or Nixpacks `NIXPACKS_NODE_VERSION=24`), not a isolated copy of `apps/backend` with no workspace context.

### Meta callback

Point the Meta app webhook and Embedded Signup redirects at the **Railway** public URL, not ngrok and not Vercel `/api`.
