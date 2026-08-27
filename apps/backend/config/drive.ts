import env from '#start/env'
import { defineConfig, services } from '@adonisjs/drive'
import type { InferDriveDisks } from '@adonisjs/drive/types'

/**
 * Private Contabo Object Storage (S3-compatible). Public WhatsApp/media links use
 * MEDIA_PUBLIC_BASE_URL, not bucket ACLs.
 */
const forcePathStyle = env.get('S3_FORCE_PATH_STYLE') ?? true

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK'),

  services: {
    s3: services.s3({
      credentials: {
        accessKeyId: env.get('S3_ACCESS_KEY_ID'),
        secretAccessKey: env.get('S3_SECRET_ACCESS_KEY').release(),
      },
      region: env.get('S3_REGION'),
      bucket: env.get('S3_BUCKET'),
      endpoint: env.get('S3_ENDPOINT'),
      forcePathStyle,
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
