# syntax=docker/dockerfile:1.7
#
# Next.js frontend (standalone output) for Contabo / Docker Compose.

##################################################
# 1. Base
##################################################
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable

##################################################
# 2. Prune monorepo to the `frontend` workspace
##################################################
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune frontend --docker

##################################################
# 3. Install + build
##################################################
FROM base AS builder
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

# Build-time public env (baked into the client bundle)
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm turbo run build --filter=frontend

##################################################
# 4. Minimal runtime (Next standalone)
##################################################
FROM node:24-alpine AS runner
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# standalone server + static assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/frontend/server.js"]
