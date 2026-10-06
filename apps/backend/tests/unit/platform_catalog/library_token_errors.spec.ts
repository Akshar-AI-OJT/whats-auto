import { test } from '@japa/runner'
import PlatformCatalogException from '#exceptions/platform_catalog_exception'
import { MetaGraphApiError } from '#lib/meta_whatsapp/graph_client'
import { PlatformTemplateCatalogService } from '#services/platform_template_catalog_service'

test.group('PlatformTemplateCatalogService.mapLibraryGraphError', () => {
  test('maps Meta OAuth 190 to E_TEMPLATE_LIBRARY_TOKEN_INVALID', ({ assert }) => {
    const service = new PlatformTemplateCatalogService()
    const mapped = () =>
      (
        service as unknown as {
          mapLibraryGraphError: (e: unknown) => never
        }
      ).mapLibraryGraphError(
        new MetaGraphApiError(
          'Error validating access token: session invalidated',
          401,
          {
            error: {
              message: 'Error validating access token: session invalidated',
              type: 'OAuthException',
              code: 190,
              error_subcode: 460,
            },
          },
          'listTemplateLibrary'
        )
      )

    try {
      mapped()
      assert.fail('expected PlatformCatalogException')
    } catch (error) {
      assert.instanceOf(error, PlatformCatalogException)
      assert.equal((error as PlatformCatalogException).code, 'E_TEMPLATE_LIBRARY_TOKEN_INVALID')
      assert.equal((error as PlatformCatalogException).status, 503)
    }
  })
})
