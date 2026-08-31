# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the AdonisJS backend in this pnpm/Turborepo monorepo.
# Same image runs HTTP (`bin/server.js`) or the BullMQ worker (`bin/worker.js`).

##################################################
# 1. Base
##################################################
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable

##################################################
# 2. Prune monorepo to the `backend` workspace
##################################################
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune backend --docker

##################################################
# 3. Install, build, and resolve prod-only deps
##################################################
FROM base AS builder
WORKDIR /app

# better-sqlite3 needs a native toolchain during install.
RUN apk add --no-cache python3 make g++

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=backend
RUN pnpm --filter=backend deploy --prod --legacy /prod/backend

##################################################
# 4. Minimal runtime image
##################################################
FROM node:24-alpine AS runner
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S adonis -u 1001 -G nodejs

COPY --from=builder --chown=adonis:nodejs /app/apps/backend/build ./
COPY --from=builder --chown=adonis:nodejs /prod/backend/node_modules ./node_modules

USER adonis
EXPOSE 3201
ENV HOST=0.0.0.0 PORT=3201

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "bin/server.js"]
