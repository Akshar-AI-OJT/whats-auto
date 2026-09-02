import type { HttpContext } from '@adonisjs/core/http'
import { OnboardingService } from '#services/onboarding_service'
import '#types/http'

export default class OnboardingController {
  /**
   * @show
   * @summary Get onboarding state for the current user
   * @description Call after login or signup verification to decide the next screen. No active organization required.
   * @tag Onboarding
   * @security BearerAuth
   * @responseBody 200 - { "data": { "activeOrganizationId": "uuid", "organizations": [{ "id": "uuid", "name": "Acme", "role": "owner" }], "nextStep": "ready" } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   */
  async show({ request, serialize }: HttpContext) {
    const state = await new OnboardingService().getState({
      userId: request.authUser!.id,
      activeOrganizationId: request.activeOrganizationId,
    })

    return serialize(state)
  }
}
