import { APIError, ValidationError, type Endpoint, type PayloadRequest } from 'payload'
import { hasBearerToken, unauthorized } from '@/bearer-token'
import { buildCatalogue } from './catalogue'
import { buildCompetencyTree } from './competency-tree'
import { buildRowLabelLookup } from './row-labels'
import type { TaskGridBatch } from './task-grid'
import { saveTaskGrid, TaskGridRefused } from './task-grid-batch'
import {
  checkPublishing,
  discardDraft,
  inTransaction,
  publishEdition,
  startEdition,
} from './edition-actions'
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

/**
 * Runs one of the course page's actions as the signed-in person and answers with its result, or
 * with the refusal's messages as `{ errors: [{ message }] }`.
 */
async function act(
  req: PayloadRequest,
  status: number,
  action: (id: string) => Promise<unknown>,
): Promise<Response> {
  if (!req.user) return unauthorized()
  const { id } = req.routeParams as { id: string }
  try {
    return Response.json(await inTransaction(req, () => action(id)), { status })
  } catch (error) {
    if (error instanceof ValidationError) {
      const errors = error.data.errors.map(({ message }) => ({ message }))
      return Response.json({ errors }, { status: 400 })
    }
    if (error instanceof APIError) {
      return Response.json({ errors: [{ message: error.message }] }, { status: error.status })
    }
    throw error
  }
}

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
  // The course page's actions, for the signed-in admin.
  {
    path: '/courseware/courses/:id/editions',
    method: 'post',
    handler: (req) =>
      act(req, 201, async (id) => {
        const { id: started, number } = await startEdition(req, id)
        return { edition: { id: started, number } }
      }),
  },
  {
    path: '/courseware/course-versions/:id/publishing-check',
    method: 'get',
    handler: (req) => act(req, 200, async (id) => ({ faults: await checkPublishing(req, id) })),
  },
  {
    path: '/courseware/course-versions/:id/publish',
    method: 'post',
    handler: (req) =>
      act(req, 200, async (id) => {
        const { number } = await publishEdition(req, id)
        return { edition: { id, number } }
      }),
  },
  {
    path: '/courseware/course-versions/:id/discard',
    method: 'post',
    handler: (req) => act(req, 200, async (id) => ({ discarded: await discardDraft(req, id) })),
  },
  {
    // The Tasks grid's save: every pending change, all or none. A refusal names each row.
    path: '/courseware/task-grid',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const batch = ((await req.json?.()) ?? {}) as TaskGridBatch
      try {
        return Response.json({ saved: await saveTaskGrid(req, batch) })
      } catch (error) {
        if (error instanceof TaskGridRefused) {
          return Response.json({ errors: error.refusals }, { status: 400 })
        }
        if (error instanceof APIError) {
          return Response.json({ errors: [{ message: error.message }] }, { status: error.status })
        }
        throw error
      }
    },
  },
]
