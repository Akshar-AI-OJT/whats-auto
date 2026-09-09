import type { HttpContext } from '@adonisjs/core/http'
import { auth } from '#lib/auth'
import { copyBetterAuthResponse } from '#lib/copy_better_auth_response'

/**
 * Forwards an Adonis request to better-auth's Fetch API handler and
 * copies the Web Response back onto the Adonis response.
 */
export async function handleBetterAuth(ctx: HttpContext) {
  const { request } = ctx
  const headers = new Headers()

  for (const [key, value] of Object.entries(request.headers())) {
    if (value !== undefined) {
      headers.set(key, String(value))
    }
  }

  const method = request.method()
  const init: RequestInit = { method, headers }

  if (!['GET', 'HEAD'].includes(method)) {
    init.body = request.raw() as RequestInit['body']
  }

  const webRequest = new Request(request.completeUrl(true), init)
  const webResponse = await auth.handler(webRequest)

  // Always send, including empty 302 OAuth callbacks, so Set-Cookie + Location flush.
  return copyBetterAuthResponse(ctx, webResponse)
}
