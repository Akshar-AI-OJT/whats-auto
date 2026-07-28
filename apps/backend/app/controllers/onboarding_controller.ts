import type { HttpContext } from '@adonisjs/core/http'
import { OnboardingService } from '#services/onboarding_service'
import '#types/http'

export default class OnboardingController {
  /**
   * @summary Get onboarding state for the current user
   * @description Call after login or signup verification to decide the next screen. No active organization required.
   * @tag Onboarding
   * @security BearerAuth
   * @responseBody 200 - { "data": { "activeOrganizationId": null, "organizations": [], "pendingInvitations": [{ "id": "uuid", "organizationName": "Acme", "role": "agent", "inviterName": "Ada", "expiresAt": "2026-07-29T12:00:00.000Z" }], "nextStep": "accept_invitation" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   */
  async show({ request, serialize }: HttpContext) {
    const state = await new OnboardingService().getState({
      userId: request.authUser!.id,
      email: request.authUser!.email,
      activeOrganizationId: request.activeOrganizationId,
    })

    return serialize(state)
  }
}
