import type { HttpContext } from '@adonisjs/core/http'
import { auth } from '#lib/auth'

/**
 * Forwards an Adonis request to better-auth's Fetch API handler and
 * copies the Web Response back onto the Adonis response.
 */
export async function handleBetterAuth({ request, response }: HttpContext) {
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

  response.status(webResponse.status)

  const setCookieHeaders =
    typeof (webResponse.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
    'function'
      ? (webResponse.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : null

  if (setCookieHeaders && setCookieHeaders.length > 0) {
    for (const cookie of setCookieHeaders) {
      response.append('Set-Cookie', cookie)
    }
  }

  webResponse.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase()
    if (lowerKey === 'set-cookie') {
      if (!setCookieHeaders) {
        response.append('Set-Cookie', value)
      }
    } else {
      response.header(key, value)
    }
  })

  const body = Buffer.from(await webResponse.arrayBuffer())

  // Always send, including empty 302 OAuth callbacks, so Set-Cookie + Location flush.
  return response.send(body)
}
