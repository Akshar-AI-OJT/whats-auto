import type { HttpContext } from '@adonisjs/core/http'

export async function copyBetterAuthResponse({ response }: HttpContext, webResponse: Response) {
  response.status(webResponse.status)

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      response.append('Set-Cookie', value)
    } else {
      response.header(key, value)
    }
  })

  const body = Buffer.from(await webResponse.arrayBuffer())

  if (body.length > 0) {
    return response.send(body)
  }
}
