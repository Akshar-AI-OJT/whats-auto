import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

type RateLimitOptions = {
  /** Max requests allowed in the window */
  max: number
  /** Window length in milliseconds */
  windowMs: number
  /** Optional key suffix (e.g. route name) */
  name?: string
}

/**
 * Simple in-memory IP rate limiter for auth OTP endpoints.
 * Sufficient for single-instance / local; swap for @adonisjs/limiter + Redis in multi-instance prod.
 */
export default class RateLimitMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: RateLimitOptions) {
    const { max, windowMs, name = 'default' } = options
    const key = `${name}:${ctx.request.ip()}`
    const now = Date.now()

    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1

    const remaining = Math.max(0, max - bucket.count)
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000)

    ctx.response.header('X-RateLimit-Limit', String(max))
    ctx.response.header('X-RateLimit-Remaining', String(remaining))
    ctx.response.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > max) {
      ctx.response.header('Retry-After', String(retryAfterSec))
      return ctx.response.tooManyRequests({
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      })
    }

    return next()
  }
}
