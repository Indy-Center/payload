import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { PrivateMedia } from './collections/PrivateMedia'
import { migrations } from './migrations'
import { storagePlugins } from './storage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, PrivateMedia],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // Other systems store these ids (training-tools, Jira), and a counter gives the same number to
    // different records in different databases. A UUID stays with its record wherever it's copied.
    // Version 7 sorts by creation time.
    idType: 'uuidv7',
    // The production image has no Payload CLI to run `payload migrate` with, so the app applies new
    // migrations itself when it first connects. Development ignores these and syncs the schema live.
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [...storagePlugins],
})
