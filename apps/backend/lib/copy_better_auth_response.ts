import type { HttpContext } from '@adonisjs/core/http'

/**
 * Copy a Better Auth Fetch Response onto Adonis, preserving every Set-Cookie.
 * Headers.forEach collapses duplicate set-cookie entries; getSetCookie does not.
 */
export async function copyBetterAuthResponse({ response }: HttpContext, webResponse: Response) {
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

  return response.send(body)
}
