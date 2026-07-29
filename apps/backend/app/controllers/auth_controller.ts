import type { HttpContext } from '@adonisjs/core/http'
import { handleBetterAuth } from '#lib/handle_better_auth'

/**
 * Better Auth still handles every /api/auth/* request. These endpoints are
 * declared explicitly so the OpenAPI generator can see the ones needed to
 * authenticate against this API — a wildcard route carries no documentation.
 */
export default class AuthController {
  /**
   * @signInEmail
   * @summary Sign in with email and password
   * @description Starts a session and sets the better-auth.session_token cookie. Step 1 of obtaining a JWT.
   * @tag Better Auth
   * @requestBody { "email": "owner@example.com", "password": "secret1234" }
   * @responseBody 200 - { "redirect": false, "token": "session-token", "user": { "id": "uuid", "email": "owner@example.com", "name": "Ada Owner", "emailVerified": true } }
   * @responseBody 401 - { "code": "INVALID_EMAIL_OR_PASSWORD", "message": "Invalid email or password" }
   * @responseBody 403 - { "message": "Account is suspended. Contact support." }
   */
  async signInEmail(ctx: HttpContext) {
    return handleBetterAuth(ctx)
  }

  /**
   * @getSession
   * @summary Get the current session
   * @description Reads the session cookie. The response also carries a freshly minted JWT in the set-auth-jwt header.
   * @tag Better Auth
   * @responseBody 200 - { "session": { "id": "uuid", "activeOrganizationId": "uuid", "expiresAt": "2026-08-05T12:00:00.000Z" }, "user": { "id": "uuid", "email": "owner@example.com", "name": "Ada Owner" } }
   * @responseHeader 200 - set-auth-jwt - Access token for Authorization: Bearer - @type(string)
   */
  async getSession(ctx: HttpContext) {
    return handleBetterAuth(ctx)
  }

  /**
   * @token
   * @summary Mint a JWT access token
   * @description Exchanges the current session cookie for a signed access token. Paste the returned value into Authorize. Re-mint after switching the active organization — org_id and scope are frozen at mint time.
   * @tag Better Auth
   * @responseBody 200 - { "token": "eyJhbGciOiJFZERTQSIsImtpZCI6Ii4uLiJ9.eyJzdWIiOiIuLi4ifQ.signature" }
   * @responseBody 401 - { "message": "Unauthorized", "code": "UNAUTHORIZED" }
   */
  async token(ctx: HttpContext) {
    return handleBetterAuth(ctx)
  }

  /**
   * @jwks
   * @summary Public JSON Web Key Set
   * @description Public halves of the Ed25519 signing keys. The API verifies every Bearer token against this endpoint and caches the result in process.
   * @tag Better Auth
   * @responseBody 200 - { "keys": [{ "alg": "EdDSA", "crv": "Ed25519", "kty": "OKP", "x": "base64url", "kid": "uuid" }] }
   */
  async jwks(ctx: HttpContext) {
    return handleBetterAuth(ctx)
  }

  /**
   * @signOut
   * @summary Sign out
   * @description Revokes the session and clears the cookie. Already-issued JWTs stay valid until they expire.
   * @tag Better Auth
   * @responseBody 200 - { "success": true }
   */
  async signOut(ctx: HttpContext) {
    return handleBetterAuth(ctx)
  }
}
