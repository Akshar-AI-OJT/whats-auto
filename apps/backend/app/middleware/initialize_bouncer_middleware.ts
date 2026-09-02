import * as abilities from '#abilities/main'
import { policies } from '#generated/policies'

import { Bouncer } from '@adonisjs/bouncer'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { AuthzPrincipal } from '#types/http'
import '#types/http'

/**
 * Init bouncer for the request.
 *
 * User resolver is lazy: jwtAuth / tenant run later on the route stack and
 * attach authUser / activeMember / memberPermissions before controllers call
 * bouncer.authorize. Do not use ctx.auth.user — this app authenticates via
 * Better Auth session + jwtAuth.
 *
 * Authz split:
 * - Cross-cutting role gates → abilities in `#abilities/main` (`accessOrgAdmin`, `accessPlatform`)
 * - Feature + resource/state → Bouncer policies in controllers
 */
export default class InitializeBouncerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    ctx.bouncer = new Bouncer(
      () => resolveAuthzPrincipal(ctx),
      abilities,
      policies
    ).setContainerResolver(ctx.containerResolver)

    return next()
  }
}

function resolveAuthzPrincipal(ctx: HttpContext): AuthzPrincipal | null {
  const user = ctx.request.authUser
  if (!user) {
    return null
  }

  return {
    ...user,
    activeMember: ctx.request.activeMember,
    memberPermissions: ctx.request.memberPermissions,
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    bouncer: Bouncer<AuthzPrincipal, typeof abilities, typeof policies>
  }
}
