import type { Endpoint } from 'payload'
import { credentialsDocument } from './credentials'
import { positionsDocument } from './positions'
import { publicRead } from './read'

/**
 * The public reads under `/api/public/v1/`, each one `publicRead(name, build, { maxAge })` from
 * `./read`. Decision 0005 lists what is public and what is not.
 */
export const publicEndpoints: Endpoint[] = [
  publicRead('credentials', credentialsDocument, { maxAge: 300 }),
  publicRead('positions', positionsDocument, { maxAge: 300 }),
]
