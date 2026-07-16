import User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import type { HttpContext } from '@adonisjs/core/http'
import '#types/http'

export default class ProfileController {
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
