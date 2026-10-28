import { APIError, docAccessOperation, ValidationError, type PayloadRequest } from 'payload'
import type { CourseVersion, LessonPlan } from '@/payload-types'
import { idOf } from './ids'

/**
 * An edition's outline (decisions 0016, 0023): which of its lesson plans sit in which module, in
 * order. It lives on the edition's `modules[].lessonPlans`, so every change here is an update to
 * the edition, made as the signed-in person through the edition's own access rules and hooks. A
 * course author's change to a published edition's outline is refused there (0055, ticket 09). The
 * lesson plan itself is never changed: one taken out of every module stays a record of its edition.
 */

export type OutlineMove = 'up' | 'down'

/** Shown where a course author's outline controls are greyed out in a published edition. */
export const STRUCTURAL_CHANGES_BY_A_LEAD =
  'Structural changes to a published edition are made by a lead.'

type Plan = Pick<LessonPlan, 'id' | 'code' | 'courseVersion'>

const refuse = (message: string): never => {
  throw new APIError(message, 400)
}

const nameOf = (plan: Plan) => plan.code || 'This lesson plan'

async function loadPlan(req: PayloadRequest, id: string): Promise<Plan> {
  return req.payload.findByID({
    collection: 'lesson-plans',
    id,
    depth: 0,
    req,
    user: req.user,
    overrideAccess: false,
  })
}

async function loadEdition(req: PayloadRequest, plan: Plan): Promise<CourseVersion> {
  return req.payload.findByID({
    collection: 'course-versions',
    id: idOf(plan.courseVersion)!,
    depth: 0,
    req,
    user: req.user,
    overrideAccess: false,
  })
}

/** Each module's lesson plan ids, as the edition holds them. */
const planIdsOf = (edition: CourseVersion) =>
  (edition.modules ?? []).map((module) => (module.lessonPlans ?? []).map((plan) => idOf(plan)!))

async function saveOutline(req: PayloadRequest, edition: CourseVersion, plans: string[][]) {
  return req.payload.update({
    collection: 'course-versions',
    id: edition.id,
    data: {
      modules: (edition.modules ?? []).map((module, index) => ({
        id: module.id,
        title: module.title,
        description: module.description,
        lessonPlans: plans[index],
      })),
    },
    depth: 0,
    req,
    user: req.user,
    overrideAccess: false,
  })
}

/**
 * Puts a lesson plan last in one of its edition's modules, taking it out of any other; or, with no
 * module, out of the outline altogether. A plan already in the chosen module stays where it is.
 */
export async function placeLessonPlan(
  req: PayloadRequest,
  planOrId: Plan | string,
  moduleId: string | null,
): Promise<void> {
  const plan = typeof planOrId === 'string' ? await loadPlan(req, planOrId) : planOrId
  const edition = await loadEdition(req, plan)
  const target = moduleId ? (edition.modules ?? []).findIndex((m) => m.id === moduleId) : -1
  if (moduleId && target < 0) {
    throw new ValidationError({
      errors: [{ path: 'module', message: `That module is not in ${edition.title}.` }],
    })
  }

  const plans = planIdsOf(edition)
  if (target >= 0 && plans[target].includes(plan.id)) return
  const placed = plans.map((ids) => ids.filter((id) => id !== plan.id))
  if (target >= 0) placed[target].push(plan.id)
  if (JSON.stringify(placed) === JSON.stringify(plans)) return
  await saveOutline(req, edition, placed)
}

/** Moves a lesson plan one place up or down within its module. */
export async function moveLessonPlan(
  req: PayloadRequest,
  planId: string,
  direction: OutlineMove,
): Promise<void> {
  if (direction !== 'up' && direction !== 'down') refuse('Move a lesson plan up or down.')
  const plan = await loadPlan(req, planId)
  const edition = await loadEdition(req, plan)
  const plans = planIdsOf(edition)
  const index = plans.findIndex((ids) => ids.includes(plan.id))
  if (index < 0) refuse(`${nameOf(plan)} is not in a module.`)

  const ids = plans[index]
  const at = ids.indexOf(plan.id)
  const to = direction === 'up' ? at - 1 : at + 1
  const title = edition.modules![index].title
  if (to < 0) refuse(`${nameOf(plan)} is already first in ${title}.`)
  if (to >= ids.length) refuse(`${nameOf(plan)} is already last in ${title}.`)
  ;[ids[at], ids[to]] = [ids[to], ids[at]]
  await saveOutline(req, edition, plans)
}

/**
 * Whether the signed-in person may change this edition's outline: the edition's own update rule,
 * asked as Payload asks it for the admin. A course author may in a draft of their course, not in a
 * published edition (0055).
 */
export async function mayChangeOutline(req: PayloadRequest, editionId: string): Promise<boolean> {
  const permissions = await docAccessOperation({
    collection: req.payload.collections['course-versions'],
    id: editionId,
    req,
  })
  return Boolean(permissions.update)
}

/** Refuses a body that names no module or a module that isn't text. */
export function moduleOf(body: unknown): string | null {
  const chosen = (body as { module?: unknown } | null)?.module
  if (chosen === null || typeof chosen === 'string') return chosen || null
  throw new ValidationError({
    errors: [{ path: 'module', message: 'Choose a module, or none to take it out.' }],
  })
}
