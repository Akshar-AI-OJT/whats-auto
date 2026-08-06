import env from '#start/env'
import { defineConfig, services } from '@adonisjs/drive'
import type { InferDriveDisks } from '@adonisjs/drive/types'

/**
 * Private S3 only. WhatsApp/public fetch uses MEDIA_PUBLIC_BASE_URL (CloudFront),
 * not bucket ACLs.
 */
const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK'),

  services: {
    s3: services.s3({
      credentials: {
        accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: env.get('AWS_SECRET_ACCESS_KEY').release(),
      },
      region: env.get('AWS_REGION'),
      bucket: env.get('S3_BUCKET'),
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
