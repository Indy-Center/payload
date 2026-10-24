import type { Endpoint, PayloadRequest } from 'payload'
import { hasBearerToken, unauthorized } from '@/bearer-token'
import { buildCatalogue } from './catalogue'
import {
  buildCourseList,
  buildCourseVersionDocument,
  findCourseVersion,
} from './course-version-document'

/**
 * Whether the request carries the library's server credential, `LIBRARY_API_TOKEN`, as a bearer
 * token. These reads include teacher notes and course authors, so they are for servers alone.
 */
const fromLibrary = (req: PayloadRequest) => hasBearerToken(req, process.env.LIBRARY_API_TOKEN)

/**
 * Whether the request carries training-tools' server credential, `TRAINING_API_TOKEN`. Each app
 * reads with its own key, so a read accepts it only if training-tools makes that read.
 */
const fromTraining = (req: PayloadRequest) => hasBearerToken(req, process.env.TRAINING_API_TOKEN)

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 })

export const coursewareEndpoints: Endpoint[] = [
  {
    path: '/courseware/catalogue',
    method: 'get',
    handler: async (req) => {
      if (!fromLibrary(req)) return unauthorized()
      return Response.json(await buildCatalogue(req))
    },
  },
  {
    path: '/courseware/courses',
    method: 'get',
    handler: async (req) => {
      if (!fromLibrary(req)) return unauthorized()
      return Response.json(await buildCourseList(req))
    },
  },
  {
    path: '/courseware/courses/:code/:which',
    method: 'get',
    handler: async (req) => {
      if (!fromLibrary(req) && !fromTraining(req)) return unauthorized()
      const { code, which } = req.routeParams as { code: string; which: string }
      if (which !== 'current' && which !== 'draft') return notFound()

      const found = await findCourseVersion(req, code, which)
      if (!found) return notFound()
      return Response.json(await buildCourseVersionDocument(req, found.versionId))
    },
  },
]
