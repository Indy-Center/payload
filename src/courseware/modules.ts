import { sql } from '@payloadcms/db-postgres'
import { APIError, ValidationError, type PayloadRequest } from 'payload'
import type { CourseVersion } from '@/payload-types'
import { idOf } from './ids'
import { isMoveDirection, type MoveDirection } from './move-direction'
import { MODULE_NEEDS_A_TITLE, STALE_OUTLINE } from './outline-messages'

/**
 * An edition's modules, changed from the course page's Content tab (ticket 09's prototype): added,
 * renamed, reordered and deleted one at a time. Modules are rows of the edition's `modules`, so each
 * change is a save of the edition, made as the signed-in person through its own access rules and
 * hooks: in a published edition a course author may change a module's title and description, and
 * nothing else (`refuseAuthorsEditionStructure`). Deleting a module never deletes a lesson plan.
 *
 * Every change the Content tab makes to an outline carries the edition's `updatedAt` as its screen
 * loaded it, and is refused if the edition has been saved since (`refuseStaleOutline`).
 */

export { MODULE_NEEDS_A_TITLE, STALE_OUTLINE }

type Module = NonNullable<CourseVersion['modules']>[number]

/** What the Content tab's module form sends. */
export type ModuleWording = { title: string; description: string | null }

/**
 * Refuses the change unless the edition is still as the screen saw it, its `updatedAt` unchanged,
 * and locks the edition's row for the rest of the request's transaction, so no other save lands
 * between this check and the change. Of two changes sent together from one `updatedAt`, the second
 * waits for the first, then finds the edition changed and is refused. Must run in a transaction.
 */
export async function refuseStaleOutline(
  req: PayloadRequest,
  editionId: string,
  updatedAt: unknown,
): Promise<void> {
  const seen = typeof updatedAt === 'string' ? new Date(updatedAt) : null
  if (!seen || Number.isNaN(seen.getTime())) throw new APIError(STALE_OUTLINE, 409)
  const transaction = req.transactionID ? await req.transactionID : null
  if (!transaction) throw new Error('The stale-outline check needs a transaction.')
  const adapter = req.payload.db as unknown as {
    sessions: Record<string, { db: { execute: (query: unknown) => Promise<{ rowCount: number }> } }>
  }
  // A no-op update: it takes the row's lock, and touches it only if it is still the one seen.
  const { rowCount } = await adapter.sessions[transaction].db.execute(
    sql`UPDATE "course_versions" SET "updated_at" = "updated_at" WHERE "id" = ${editionId} AND "updated_at" = ${seen.toISOString()}::timestamptz`,
  )
  if (rowCount !== 1) throw new APIError(STALE_OUTLINE, 409)
}

/** The edition as the signed-in person may read it. */
export async function loadEdition(req: PayloadRequest, id: string): Promise<CourseVersion> {
  return req.payload.findByID({
    collection: 'course-versions',
    id,
    depth: 0,
    req,
    user: req.user,
    overrideAccess: false,
  })
}

const asStored = (module: Module) => ({
  id: module.id,
  title: module.title,
  description: module.description ?? null,
  lessonPlans: (module.lessonPlans ?? []).map((plan) => idOf(plan)!),
})

async function saveModules(
  req: PayloadRequest,
  edition: CourseVersion,
  modules: ReturnType<typeof asStored>[],
): Promise<CourseVersion> {
  return req.payload.update({
    collection: 'course-versions',
    id: edition.id,
    data: { modules },
    depth: 0,
    req,
    user: req.user,
    overrideAccess: false,
  })
}

const refuse = (path: string, message: string): never => {
  throw new ValidationError({ errors: [{ path, message }] })
}

/** A module's title and description from a request body, refusing an empty title. */
export function wordingOf(body: unknown): ModuleWording {
  const { title, description } = (body ?? {}) as { title?: unknown; description?: unknown }
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (!trimmed) refuse('title', MODULE_NEEDS_A_TITLE)
  const text = typeof description === 'string' ? description.trim() : ''
  return { title: trimmed, description: text || null }
}

function indexOfModule(edition: CourseVersion, moduleId: string, path = 'module'): number {
  const index = (edition.modules ?? []).findIndex((module) => module.id === moduleId)
  if (index < 0) refuse(path, `That module is not in ${edition.title}.`)
  return index
}

/** Adds a module, with no lesson plans yet, at the end of the edition's modules. */
export async function addModule(
  req: PayloadRequest,
  editionId: string,
  wording: ModuleWording,
): Promise<CourseVersion> {
  const edition = await loadEdition(req, editionId)
  const modules = (edition.modules ?? []).map(asStored)
  return saveModules(req, edition, [...modules, { id: undefined, ...wording, lessonPlans: [] }])
}

/** Changes one module's title and description; its lesson plans stay as they are. */
export async function editModule(
  req: PayloadRequest,
  editionId: string,
  moduleId: string,
  wording: ModuleWording,
): Promise<CourseVersion> {
  const edition = await loadEdition(req, editionId)
  const index = indexOfModule(edition, moduleId)
  const modules = (edition.modules ?? []).map(asStored)
  modules[index] = { ...modules[index], ...wording }
  return saveModules(req, edition, modules)
}

/** Moves one module a place up or down among the edition's modules, with its lesson plans. */
export async function moveModule(
  req: PayloadRequest,
  editionId: string,
  moduleId: string,
  direction: MoveDirection,
): Promise<CourseVersion> {
  if (!isMoveDirection(direction)) refuse('direction', 'Move a module up or down.')
  const edition = await loadEdition(req, editionId)
  const at = indexOfModule(edition, moduleId)
  const modules = (edition.modules ?? []).map(asStored)
  const to = direction === 'up' ? at - 1 : at + 1
  if (to < 0) refuse('direction', `${modules[at].title} is already the first module.`)
  if (to >= modules.length) refuse('direction', `${modules[at].title} is already the last module.`)
  ;[modules[at], modules[to]] = [modules[to], modules[at]]
  return saveModules(req, edition, modules)
}

/**
 * Deletes a module. Its lesson plans are kept: with no `lessonPlansTo` they leave the outline and
 * are listed under "Not in a module"; with another module's id they go to its end, in their order.
 */
export async function deleteModule(
  req: PayloadRequest,
  editionId: string,
  moduleId: string,
  lessonPlansTo: string | null,
): Promise<CourseVersion> {
  const edition = await loadEdition(req, editionId)
  const at = indexOfModule(edition, moduleId)
  const modules = (edition.modules ?? []).map(asStored)
  const [deleted] = modules.splice(at, 1)
  if (lessonPlansTo !== null) {
    const target = modules.find((module) => module.id === lessonPlansTo)
    if (!target) return refuse('lessonPlansTo', `That module is not in ${edition.title}.`)
    target.lessonPlans = [...target.lessonPlans, ...deleted.lessonPlans]
  }
  return saveModules(req, edition, modules)
}

/** Where a deleted module's lesson plans go: another module's id, or null for none. */
export function lessonPlansToOf(body: unknown): string | null {
  const to = (body as { lessonPlansTo?: unknown } | null)?.lessonPlansTo
  if (to === null || to === undefined || to === '') return null
  if (typeof to === 'string') return to
  return refuse('lessonPlansTo', 'Choose a module for its lesson plans, or none.')
}
