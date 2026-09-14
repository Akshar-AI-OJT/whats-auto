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
     * latin1 preserves raw bytes as a string (utf-8 would corrupt PDF/binary).
     */
    encoding: 'latin1',

    /**
     * Content types handled as raw buffers (browser media PUT).
     * Wildcards cover variants; json/form/multipart parsers run first.
     */
    types: ['application/*', 'image/*', 'text/csv', 'text/plain'],
  },
})

export default bodyParserConfig
