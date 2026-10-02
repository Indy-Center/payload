import { s3Storage } from '@payloadcms/storage-s3'
import type { Plugin } from 'payload'

/**
 * Uploads go to Cloudflare R2 through its S3 API, in two buckets:
 *
 * - `media` goes to the public bucket. Its files are served straight from the bucket's custom
 *   domain (`R2_PUBLIC_URL`), never through this app, so anyone with a file's URL can read it.
 * - `private-media` goes to the private bucket, which has no public access. Its files are only
 *   served by this app, after the collection's read access has been checked.
 *
 * Each bucket is used only when all of its settings are present. Without them the collection keeps
 * its files on local disk, which is what local development and CI do.
 */
const endpoint = process.env.R2_ENDPOINT
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const publicBucket = process.env.R2_PUBLIC_BUCKET
const publicURL = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '')
const privateBucket = process.env.R2_PRIVATE_BUCKET

const hasCredentials = Boolean(endpoint && accessKeyId && secretAccessKey)

const config = {
  endpoint,
  // R2 has no regions; the SDK still wants one.
  region: 'auto',
  forcePathStyle: true,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
}

export const storagePlugins: Plugin[] = [
  s3Storage({
    enabled: hasCredentials && Boolean(publicBucket && publicURL),
    // Keeps the database schema the same whether or not the bucket is configured, so a migration
    // created in development matches production.
    alwaysInsertFields: true,
    bucket: publicBucket || '',
    clientCacheKey: 's3:public',
    config,
    collections: {
      media: {
        disablePayloadAccessControl: true,
        // The default URL is the S3 API endpoint, which R2 doesn't serve files from.
        generateFileURL: ({ filename, prefix }) =>
          [publicURL, prefix, encodeURIComponent(filename)].filter(Boolean).join('/'),
      },
    },
  }),
  s3Storage({
    enabled: hasCredentials && Boolean(privateBucket),
    alwaysInsertFields: true,
    bucket: privateBucket || '',
    clientCacheKey: 's3:private',
    config,
    collections: {
      'private-media': true,
    },
  }),
]
