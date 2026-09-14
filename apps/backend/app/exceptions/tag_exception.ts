import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Contact tag / grouping domain errors with stable API codes.
 */
export default class TagException extends Exception {
  static notFound() {
    return new this('Tag not found', {
      status: 404,
      code: 'E_TAG_NOT_FOUND',
    })
  }

  static duplicateName() {
    return new this('A tag with this name already exists', {
      status: 409,
      code: 'E_TAG_NAME_EXISTS',
    })
  }

  static duplicateAssignment() {
    return new this('This contact is already assigned to the tag', {
      status: 409,
      code: 'E_TAG_ASSIGNMENT_EXISTS',
    })
  }

  static invalidContact() {
    return new this('Contact not found for this organization', {
      status: 422,
      code: 'E_TAG_INVALID_CONTACT',
    })
  }

  static assignmentNotFound() {
    return new this('Tag assignment not found', {
      status: 404,
      code: 'E_TAG_ASSIGNMENT_NOT_FOUND',
    })
  }

  static emptyUpdate() {
    return new this('Provide at least one of name, color, description, or status', {
      status: 422,
      code: 'E_TAG_EMPTY_UPDATE',
    })
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
