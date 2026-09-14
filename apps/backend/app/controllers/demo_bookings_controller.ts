import type { HttpContext } from '@adonisjs/core/http'
import { DemoBookingService } from '#services/demo_booking_service'
import {
  createDemoBookingValidator,
  demoAvailabilityQueryValidator,
} from '#validators/demo_booking'

export default class DemoBookingsController {
  /**
   * @availability
   * @summary List available demo slots for a civil date
   * @description Public. Returns only unbooked future slots in the platform demo timezone. Does not require organization authentication.
   * @tag Demo
   * @paramQuery date - Civil date YYYY-MM-DD - @type(string) @required
   * @paramQuery timeZone - Viewer IANA timezone (optional, validated) - @type(string)
   * @responseBody 200 - { "date": "2026-09-15", "timeZone": "Asia/Kolkata", "today": "2026-09-07", "durationMinutes": 30, "slots": [{ "id": "2026-09-15T04:30:00.000Z", "startTime": "2026-09-15T04:30:00.000Z", "endTime": "2026-09-15T05:00:00.000Z", "label": "10:00 AM", "available": true }] }
   * @responseBody 422 - { "error": "Provide a valid date as YYYY-MM-DD", "code": "E_DEMO_DATE_INVALID" }
   */
  async availability({ request, response }: HttpContext) {
    const { date, timeZone } = await request.validateUsing(demoAvailabilityQueryValidator, {
      data: request.qs(),
    })

    const payload = await new DemoBookingService().getAvailability(date, timeZone)
    return response.ok(payload)
  }

  /**
   * @store
   * @summary Book a product demo slot
   * @description Public. Re-validates availability on the server, creates the booking atomically, attempts a Google Meet event, and sends a confirmation email.
   * @tag Demo
   * @requestBody { "name": "Jane Doe", "email": "jane@company.com", "slotId": "2026-09-15T04:30:00.000Z", "timeZone": "Asia/Kolkata", "company": "Acme Inc.", "phone": "+15550000000", "companySize": "11-50", "purpose": "overview" }
   * @responseBody 201 - { "id": "uuid", "fullName": "Jane Doe", "email": "jane@company.com", "startsAt": "2026-09-15T04:30:00.000Z", "endsAt": "2026-09-15T05:00:00.000Z", "timeZone": "Asia/Kolkata", "demoTimeZone": "Asia/Kolkata", "status": "confirmed", "meetingUrl": "https://meet.google.com/abc-defg-hij" }
   * @responseBody 409 - { "error": "This time slot is no longer available", "code": "E_DEMO_SLOT_UNAVAILABLE" }
   * @responseBody 422 - { "error": "The selected time slot is not valid", "code": "E_DEMO_SLOT_INVALID" }
   */
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createDemoBookingValidator)
    const booking = await new DemoBookingService().createBooking({
      name: payload.name,
      email: payload.email,
      slotId: payload.slotId,
      timeZone: payload.timeZone,
      company: payload.company,
      phone: payload.phone,
      companySize: payload.companySize,
      purpose: payload.purpose,
    })

    return response.created(booking)
  }
}
