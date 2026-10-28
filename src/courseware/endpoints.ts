import type { Endpoint, PayloadRequest } from 'payload'
import { hasBearerToken, unauthorized } from '@/bearer-token'
import { buildCatalogue } from './catalogue'
import { buildCompetencyTree } from './competency-tree'
import { buildRowLabelLookup } from './row-labels'
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
    // For the admin's row labels, read by a signed-in browser session rather than a server token.
    path: '/courseware/row-labels',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      return Response.json(await buildRowLabelLookup(req))
    },
  },
  {
    path: '/courseware/catalogue',
    method: 'get',
    handler: async (req) => {
      if (!fromLibrary(req)) return unauthorized()
      return Response.json(await buildCatalogue(req))
    },
  },
  {
    // The admin's Competencies list, for the signed-in person: not one of the reads for other apps.
    path: '/courseware/competency-tree',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const param = (name: string) =>
        typeof req.query?.[name] === 'string' ? (req.query[name] as string) : undefined
      const tree = await buildCompetencyTree(req, {
        edition: param('edition'),
        search: param('search'),
      })
      return tree ? Response.json(tree) : notFound()
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
      const { code, which } = req.routeParams as { code: string; which: string }
      // training-tools grades from published versions only, so its key never opens a draft.
      if (!fromLibrary(req) && !(which === 'current' && fromTraining(req))) return unauthorized()
      if (which !== 'current' && which !== 'draft') return notFound()

      const found = await findCourseVersion(req, code, which)
      if (!found) return notFound()
      return Response.json(await buildCourseVersionDocument(req, found.versionId))
    },
  },
]
