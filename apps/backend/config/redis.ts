import env from '#start/env'

/**
 * Redis connection for AI debounce/memory and the BullMQ AI driver.
 * Empty url is valid in test — callers must fail clearly if they need Redis.
 */
const redisConfig = {
  url: env.get('REDIS_URL') ?? '',
}

export default redisConfig
