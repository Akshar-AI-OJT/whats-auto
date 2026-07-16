import type { auth } from '#lib/auth'

export type AuthUser = typeof auth.$Infer.Session.user

declare module '@adonisjs/core/http' {
  interface HttpRequest {
    authUser?: AuthUser
  }
}
