import app from '@adonisjs/core/services/app'
import { defineConfig, services } from '@adonisjs/drive'
import type { InferDriveDisks } from '@adonisjs/drive/types'
import env from '#start/env'

/**
 * Drive disks mirror OBJECT_STORAGE_DRIVER.
 * Media uploads use ObjectStorage; Drive stays available for other disk ops.
 * Public WhatsApp/media links use MEDIA_PUBLIC_BASE_URL, not ACLs.
 *
 * Both disks are registered so InferDriveDisks stays stable across fs/s3 env;
 * `default` follows OBJECT_STORAGE_DRIVER (must match DRIVE_DISK).
 */
const driver = env.get('OBJECT_STORAGE_DRIVER')
const driveDisk = env.get('DRIVE_DISK')
if (driver !== driveDisk) {
  throw new Error(`OBJECT_STORAGE_DRIVER (${driver}) must match DRIVE_DISK (${driveDisk})`)
}

const localRoot = env.get('MEDIA_LOCAL_ROOT') || app.makePath('tmp/media')

/**
 * S3 service options are only required at runtime when default is s3.
 * Placeholders keep the config object constructible in fs mode.
 */
const s3AccessKeyId = env.get('S3_ACCESS_KEY_ID') ?? 'unused'
const s3SecretAccessKey = env.get('S3_SECRET_ACCESS_KEY')?.release() ?? 'unused'
const s3Region = env.get('S3_REGION') ?? 'unused'
const s3Bucket = env.get('S3_BUCKET') ?? 'unused'
const s3Endpoint = env.get('S3_ENDPOINT') ?? 'https://example.invalid'

const diskServices = {
  fs: services.fs({
    location: localRoot,
    visibility: 'private' as const,
    serveFiles: false,
  }),
  s3: services.s3({
    credentials: {
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
    },
    region: s3Region,
    bucket: s3Bucket,
    endpoint: s3Endpoint,
    forcePathStyle: env.get('S3_FORCE_PATH_STYLE') ?? true,
    visibility: 'private' as const,
  }),
}

/**
 * Fixed `default: 'fs'` exists only so InferDriveDisks resolves to a concrete
 * object type (env-driven `default` is `'fs' | 's3'` and breaks the augment).
 */
const driveConfigForTypes = defineConfig({
  default: 'fs' as const,
  services: diskServices,
})

const driveConfig = defineConfig({
  default: driver,
  services: diskServices,
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfigForTypes> {}
}
