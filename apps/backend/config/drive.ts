import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, services } from '@adonisjs/drive'

const requestedDisk = env.get('DRIVE_DISK') ?? env.get('OBJECT_STORAGE_DRIVER') ?? 'fs'
const s3Bucket = env.get('S3_BUCKET')
const s3AccessKeyId = env.get('S3_ACCESS_KEY_ID')
const s3SecretAccessKey = env.get('S3_SECRET_ACCESS_KEY')
const s3Configured = Boolean(s3Bucket && s3AccessKeyId && s3SecretAccessKey)
const defaultDisk = requestedDisk === 's3' && s3Configured ? 's3' : 'fs'

const driveConfig = defineConfig({
  default: defaultDisk,
  services: {
    fs: services.fs({
      location: app.makePath(app.inTest ? 'tmp/storage' : 'storage'),
      visibility: 'private',
      serveFiles: false,
    }),
    s3: services.s3({
      credentials: {
        accessKeyId: s3AccessKeyId ?? 'local',
        secretAccessKey: s3SecretAccessKey ?? 'local',
      },
      region: env.get('S3_REGION') ?? 'us-east-1',
      bucket: s3Bucket ?? 'local',
      ...(env.get('S3_ENDPOINT') ? { endpoint: env.get('S3_ENDPOINT') } : {}),
      forcePathStyle: env.get('S3_FORCE_PATH_STYLE') ?? false,
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
