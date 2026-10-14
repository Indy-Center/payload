import { timingSafeEqual } from 'node:crypto'
import type { Endpoint, PayloadRequest } from 'payload'
import { buildCatalogue } from './catalogue'
import {
  buildCourseList,
  buildCourseVersionDocument,
  findCourseVersion,
} from './course-version-document'

/**
 * Whether the request carries the library's server credential, `LIBRARY_API_TOKEN`, as a bearer
 * token. These reads include teacher notes and course authors, so they are for the library's
 * server alone; with no token configured, nobody gets in.
 */
function fromLibrary(req: PayloadRequest): boolean {
  const expected = process.env.LIBRARY_API_TOKEN
  const header = req.headers.get('authorization') ?? ''
  if (!expected || !header.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice('Bearer '.length))
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })
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
      if (!fromLibrary(req)) return unauthorized()
      const { code, which } = req.routeParams as { code: string; which: string }
      if (which !== 'current' && which !== 'draft') return notFound()

      const found = await findCourseVersion(req, code, which)
      if (!found) return notFound()
      return Response.json(await buildCourseVersionDocument(req, found.versionId))
    },
  },
]
