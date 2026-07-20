import User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http'

export default class ProfileController {
  /**
   * @summary Get current user's profile
   * @tag Account
   * @security BearerAuth
   * @responseBody 200 - { "data": { "id": "uuid", "name": "string", "firstname": "string", "lastname": "string", "email": "string", "initials": "string" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   * @responseBody 404 - { "error": "User not found" }
   */
  async show({ request, serialize, response }: HttpContext) {
    const authUser = request.authUser

    if (!authUser) {
      return response.unauthorized({ error: 'Unauthorized' })
    }

    const user = await User.find(authUser.id)

    if (!user) {
      return response.notFound({ error: 'User not found' })
    }

    return serialize(UserTransformer.transform(user))
  }
}
