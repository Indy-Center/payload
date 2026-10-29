import { APIError, ValidationError, type Endpoint, type PayloadRequest } from 'payload'
import { hasBearerToken, unauthorized } from '@/bearer-token'
import { buildCatalogue } from './catalogue'
import { buildCompetencyTree } from './competency-tree'
import { buildRowLabelLookup } from './row-labels'
import { IMPORT_ENDPOINTS } from './import/form'
import { importUpload } from './import/upload'
import type { MoveDirection } from './move-direction'
import type { TaskGridBatch } from './task-grid'
import { saveTaskGrid, TaskGridRefused } from './task-grid-batch'
import { moveTask } from './task-move'
import { loadTaskNumber, loadTaskOptions } from './task-picker'
import {
  checkPublishing,
  discardDraft,
  inTransaction,
  publishEdition,
  startEdition,
} from './edition-actions'
import { moduleOf, moveLessonPlan, placeLessonPlan } from './outline'
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

/** A query parameter with something in it, or undefined. */
const queryText = (req: PayloadRequest, name: string) => {
  const value = req.query?.[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** The request's JSON body, or `{}` when it has none or it isn't JSON: the action then refuses. */
async function jsonBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** A refusal as the admin's screens read it, `{ errors: [{ message }] }`, or null if it isn't one. */
function refusalOf(error: unknown): Response | null {
  if (error instanceof TaskGridRefused)
    return Response.json({ errors: error.refusals }, { status: 400 })
  if (error instanceof ValidationError) {
    const errors = error.data.errors.map(({ message }) => ({ message }))
    return Response.json({ errors }, { status: 400 })
  }
  if (error instanceof APIError)
    return Response.json({ errors: [{ message: error.message }] }, { status: error.status })
  return null
}

/** Runs an admin screen's action as the signed-in person, and answers with its result or refusal. */
async function answer(
  req: PayloadRequest,
  status: number,
  action: () => Promise<unknown>,
): Promise<Response> {
  if (!req.user) return unauthorized()
  try {
    return Response.json(await action(), { status })
  } catch (error) {
    const refusal = refusalOf(error)
    if (refusal) return refusal
    throw error
  }
}

/** `answer`, for an action on the record the route's `:id` names, in one transaction. */
const act = (req: PayloadRequest, status: number, action: (id: string) => Promise<unknown>) =>
  answer(req, status, () =>
    inTransaction(req, () => action((req.routeParams as { id: string }).id)),
  )

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
      const tree = await buildCompetencyTree(req, {
        edition: queryText(req, 'edition'),
        search: queryText(req, 'search'),
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
  // The course page's Content: a lesson plan moved up or down in its module, or put last in a
  // module or taken out of the outline. Each is a save of the edition, through its own rules.
  {
    path: '/courseware/lesson-plans/:id/move',
    method: 'post',
    handler: (req) =>
      act(req, 200, async (id) => {
        const { direction } = await jsonBody(req)
        await moveLessonPlan(req, id, direction as MoveDirection)
        return { moved: id }
      }),
  },
  {
    path: '/courseware/lesson-plans/:id/module',
    method: 'post',
    handler: (req) =>
      act(req, 200, async (id) => {
        const moduleId = moduleOf(await jsonBody(req))
        await placeLessonPlan(req, id, moduleId)
        return { placed: id, module: moduleId }
      }),
  },
  // The import page's Check and Import, for the Training Admin. The form is a multipart upload.
  {
    path: IMPORT_ENDPOINTS.check,
    method: 'post',
    handler: (req) => act(req, 200, () => importUpload(req, { dryRun: true })),
  },
  {
    path: IMPORT_ENDPOINTS.import,
    method: 'post',
    handler: (req) => act(req, 200, () => importUpload(req, { dryRun: false })),
  },
  // The Tasks list's screens.
  {
    // The grid's save: every pending change, all or none. A refusal names each row. The save
    // runs its own transactions.
    path: '/courseware/task-grid',
    method: 'post',
    handler: (req) =>
      answer(req, 200, async () => ({
        saved: await saveTaskGrid(req, (await jsonBody(req)) as TaskGridBatch),
      })),
  },
  {
    // The tree's ↑ and ↓: saves at once.
    path: '/courseware/tasks/:id/move',
    method: 'post',
    handler: (req) =>
      act(req, 200, async (id) => {
        const { direction } = await jsonBody(req)
        return moveTask(req, id, direction as MoveDirection)
      }),
  },
  {
    // The admin's task pickers (TaskPicker).
    path: '/courseware/task-options',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      return Response.json(
        await loadTaskOptions(req, {
          search: queryText(req, 'search'),
          current: queryText(req, 'current'),
          exclude: queryText(req, 'exclude'),
        }),
      )
    },
  },
  {
    // A task page's title (TaskTitle): its number alone, as `{ number }`.
    path: '/courseware/tasks/:id/number',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const { id } = req.routeParams as { id: string }
      const number = await loadTaskNumber(req, id)
      return number === null ? notFound() : Response.json({ number })
    },
  },
]
