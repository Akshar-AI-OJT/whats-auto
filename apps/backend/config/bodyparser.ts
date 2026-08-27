import { defineConfig } from '@adonisjs/core/bodyparser'

const bodyParserConfig = defineConfig({
  /**
   * Parse request bodies for these HTTP methods.
   * Keep this aligned with methods that receive payloads in your routes.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Config for the "application/x-www-form-urlencoded"
   * content-type parser.
   */
  form: {
    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Content types handled by the form parser.
     */
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * Config for the JSON parser.
   */
  json: {
    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Content types handled by the JSON parser.
     */
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /**
   * Config for the "multipart/form-data" content-type parser.
   * File uploads are handled by the multipart parser.
   */
  multipart: {
    autoProcess: true,
    convertEmptyStringsToNull: true,
    processManually: [],
    limit: '20mb',
    types: ['multipart/form-data'],
  },

  /**
   * Config for the raw body parser (local-disk media PUT uploads).
   */
  raw: {
    /**
     * Maximum accepted payload size — documents up to 100 MiB outbound.
     */
    limit: '110mb',

    /**
     * Content types handled as raw buffers (browser media PUT).
     */
    types: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/octet-stream',
      'text/csv',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/csv',
    ],
  },
})

export default bodyParserConfig
