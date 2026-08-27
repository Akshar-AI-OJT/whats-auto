import env from '#start/env'
import { defineConfig, services } from '@adonisjs/drive'
import type { InferDriveDisks } from '@adonisjs/drive/types'

/**
 * Private S3 (or S3-compatible) disk. WhatsApp/public fetch uses
 * MEDIA_PUBLIC_BASE_URL (CDN / Contabo public base), not bucket ACLs.
 *
 * Contabo Object Storage (and MinIO/R2): set S3_ENDPOINT + S3_FORCE_PATH_STYLE=true.
 * Native AWS S3: leave S3_ENDPOINT unset.
 */
const s3Endpoint = env.get('S3_ENDPOINT')
const forcePathStyle = env.get('S3_FORCE_PATH_STYLE') ?? Boolean(s3Endpoint)

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
      ...(s3Endpoint ? { endpoint: s3Endpoint } : {}),
      forcePathStyle,
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
