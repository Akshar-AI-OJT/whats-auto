/*
|--------------------------------------------------------------------------
| Job worker entrypoint
|--------------------------------------------------------------------------
|
| Separate process from HTTP. Starts the configured queue driver and registers
| consumers. Set JOB_QUEUE_WORKER=1 so tenant RLS pool stamping is enabled
| (same as web/test).
|
| Usage:
|   JOB_QUEUE_WORKER=1 JOB_QUEUE_DRIVER=pgboss node --import=tsx bin/worker.ts
|   or after build: JOB_QUEUE_WORKER=1 node build/bin/worker.js
|
*/

process.env.JOB_QUEUE_WORKER = '1'

await import('reflect-metadata')
const { Ignitor, prettyPrintError } = await import('@adonisjs/core')

const APP_ROOT = new URL('../', import.meta.url)

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

/**
 * Boot the app as `web` so providers (including tenant RLS) match HTTP,
 * without starting the HTTP server.
 */
const ignitor = new Ignitor(APP_ROOT, { importer: IMPORTER }).tap((app) => {
  app.booting(async () => {
    await import('#start/env')
  })
  app.listen('SIGTERM', () => app.terminate())
  app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())
})

try {
  const app = ignitor.createApp('web')
  await app.init()
  await app.boot()

  const { default: JobQueueManager } = await import('#services/job_queue/job_queue_manager')
  const { registerJobHandlers } = await import('#services/job_queue/register_handlers')
  const logger = await app.container.make('logger')

  const manager = await app.container.make(JobQueueManager)
  const driver = await manager.start()
  await registerJobHandlers(driver)

  const driverName = app.config.get('job_queue.default')
  logger.info({ driver: driverName }, 'job_queue.worker.started')
  console.log(`[job_queue] worker started (driver=${driverName})`)

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      logger.info('job_queue.worker.stopping')
      console.log('[job_queue] worker stopping')
      await manager.stop()
      await app.terminate()
      resolve()
    }
    process.once('SIGTERM', () => {
      void shutdown()
    })
    process.once('SIGINT', () => {
      void shutdown()
    })
  })
} catch (error) {
  process.exitCode = 1
  prettyPrintError(error)
}
