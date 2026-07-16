import { UserSchema } from '#database/schema'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

export default class User extends UserSchema {
  static accessTokens = DbAccessTokensProvider.forModel(User)

  declare currentAccessToken?: AccessToken

  get initials() {
    if (this.firstname && this.lastname) {
      return `${this.firstname.charAt(0)}${this.lastname.charAt(0)}`.toUpperCase()
    }

    return this.name.slice(0, 2).toUpperCase()
  }
}
