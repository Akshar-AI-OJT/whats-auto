import type { ApplicationService } from '@adonisjs/core/types'
import { ContentInspection } from '#services/content_inspection/contracts/content_inspection'
import SignatureContentInspection from '#services/content_inspection/drivers/signature_content_inspection'

/**
 * Binds ContentInspection to the signature stub (malware scanner can replace later).
 */
export default class ContentInspectionProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(ContentInspection, () => {
      return new SignatureContentInspection()
    })
  }
}
