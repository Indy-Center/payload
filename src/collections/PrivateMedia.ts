import path from 'path'
import type { CollectionConfig } from 'payload'

// Files only signed-in users may read. In production they live in the private R2 bucket and are
// served by this app after the read check below; see src/storage.ts.
export const PrivateMedia: CollectionConfig = {
  slug: 'private-media',
  labels: {
    singular: 'Private file',
    plural: 'Private files',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
  },
  fields: [],
  upload: {
    // Only used when the private bucket isn't configured. It must not be inside media/: the public
    // media collection serves any file under its own directory to anyone, by path.
    staticDir: path.resolve(process.cwd(), 'private-media'),
  },
}
