import { HttpContext } from '@adonisjs/core/http'
import { BaseSerializer } from '@adonisjs/core/transformers'
import { type SimplePaginatorMetaKeys } from '@adonisjs/lucid/types/querybuilder'

/**
 * Custom serializer for API responses that ensures consistent JSON structure
 * across all API endpoints. Wraps response data in a 'data' property and handles
 * pagination metadata for Lucid ORM query results.
 */
class ApiSerializer extends BaseSerializer<{
  Wrap: 'data'
  PaginationMetaData: SimplePaginatorMetaKeys
}> {
  /**
   * Wraps all serialized data under this key in the response object.
   * Example: { data: [...] } instead of returning raw arrays/objects
   */
  wrap: 'data' = 'data'

  /**
   * Validates and defines pagination metadata structure for paginated responses.
   * Ensures that pagination info from Lucid queries is properly formatted.
   *
   * @throws Error if metadata doesn't match Lucid's pagination structure
   */
  definePaginationMetaData(metaData: unknown): SimplePaginatorMetaKeys {
    if (!this.isLucidPaginatorMetaData(metaData)) {
      throw new Error(
        'Invalid pagination metadata. Expected metadata to contain Lucid pagination keys'
      )
    }
    return metaData
  }
}

/**
 * Single instance of ApiSerializer used across the application
 */
const serializer = new ApiSerializer()
const serialize = Object.assign(
  function (this: HttpContext, ...[data, resolver]: Parameters<ApiSerializer['serialize']>) {
    return serializer.serialize(data, resolver ?? this.containerResolver)
  },
  {
    withoutWrapping(
      this: HttpContext,
      ...[data, resolver]: Parameters<ApiSerializer['serializeWithoutWrapping']>
    ) {
      return serializer.serializeWithoutWrapping(data, resolver ?? this.containerResolver)
    },
  }
) as ApiSerializer['serialize'] & { withoutWrapping: ApiSerializer['serializeWithoutWrapping'] }

/**
 * Adds the serialize method to all HttpContext instances.
 * Usage in controllers: return ctx.serialize(data)
 * This ensures all API responses follow the same structure with data wrapping.
 */
HttpContext.instanceProperty('serialize', serialize)

/**
 * Module augmentation to add the serialize method to HttpContext.
 * This allows controllers to use ctx.serialize() for consistent API responses.
 */
declare module '@adonisjs/core/http' {
  export interface HttpContext {
    serialize: typeof serialize
  }
}

import type { ApplicationService } from '@adonisjs/core/types'
import { RazorpayOrderService } from '#services/billing/razorpay_order_service'
import { PlanService } from '#services/billing/plan_service'
import { PlanRepository } from '#repositories/plan_repository'
import { OrganizationSubscriptionRepository } from '#repositories/organization_subscription_repository'
import { BillingOrderRepository } from '#repositories/billing_order_repository'

export default class ApiProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(RazorpayOrderService, async (resolver) => {
      const plans = await resolver.make(PlanRepository)
      const subs = await resolver.make(OrganizationSubscriptionRepository)
      const orders = await resolver.make(BillingOrderRepository)
      return new RazorpayOrderService(plans, subs, orders)
    })

    this.app.container.singleton(PlanService, async (resolver) => {
      const plans = await resolver.make(PlanRepository)
      return new PlanService(plans)
    })
  }
}
