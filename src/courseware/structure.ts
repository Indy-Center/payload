import { Forbidden, ValidationError, type PayloadRequest } from 'payload'
import type { CourseVersion, LessonPlan, User } from '@/payload-types'
import { isStaff } from './access'
import { idOf } from './ids'

/**
 * What only the Training Admin and leads may change in a published edition (decisions 0055,
 * 0065). A course author keeps editing their course's wording and teacher notes there, including
 * each lesson plan task's teacher notes; its structure is the staff's: which tasks a lesson plan
 * holds and in what order, whether each is required and what it grades. In a draft a course
 * author changes anything, as before. On the edition's own record a published edition lets a
 * course author change its modules' titles and descriptions only (`refuseAuthorsEditionStructure`).
 * A scenario holds no structure: everything on it is wording.
 *
 * A save made without a user, such as a script on the Local API, is not limited.
 */

type Ref = string | { id: string } | null | undefined
const ids = (refs: readonly Ref[] | null | undefined) => (refs ?? []).map(idOf)

const NEEDS_A_LEAD = 'which needs the Training Admin or a lead.'
const WORDING_STILL = 'Its wording and teacher notes can still change.'
const NEW_PLAN = `This edition is published, so adding a lesson plan to it is a structural change, ${NEEDS_A_LEAD}`
const PLAN_STRUCTURE = `This lesson plan is in a published edition, so changing its tasks, their order, whether each is required or what it grades, its minimum, the scenarios it offers or its edition is a structural change, ${NEEDS_A_LEAD} ${WORDING_STILL}`

const refuse = (path: string, message: string): never => {
  throw new ValidationError({ errors: [{ path, message }] })
}

const mayChangeStructure = (req: PayloadRequest) =>
  !req.user || isStaff(req.user as Pick<User, 'roles' | 'cid'>)

function lessonPlanStructure(plan: Partial<LessonPlan>): string {
  return JSON.stringify([
    idOf(plan.courseVersion),
    plan.minimum ?? null,
    (plan.tasks ?? []).map((row) => [
      row.id,
      idOf(row.task),
      row.required !== false,
      row.gradesKnowledge === true,
      row.gradesSkill === true,
    ]),
    ids(plan.scenarios),
  ])
}

async function isPublished(req: PayloadRequest, versionId: string | null): Promise<boolean> {
  if (!versionId) return false
  const version = await req.payload.findByID({
    collection: 'course-versions',
    id: versionId,
    depth: 0,
    req,
  })
  return version.status === 'published'
}

/**
 * Whether the person on `req` may change the structure of a lesson plan in this edition: always in
 * a draft, and in a published edition only as the Training Admin or a lead.
 */
export async function mayChangeLessonPlanStructure(
  req: PayloadRequest,
  versionId: string | null,
): Promise<boolean> {
  return mayChangeStructure(req) || !(await isPublished(req, versionId))
}

/**
 * An edition's outline as far as a course author may not change it once it is published: its
 * modules without their wording (each by id, with its lesson plans in order).
 */
const editionStructure = (edition: Partial<CourseVersion>) =>
  JSON.stringify(
    (edition.modules ?? []).map((module) => [module.id ?? null, ids(module.lessonPlans)]),
  )

/**
 * In a published edition a course author may reword the edition (its description and completion
 * standard) and its modules (title and description, 0055) and change nothing else: adding,
 * deleting or reordering modules, or moving lesson plans among them, is refused with the edition's
 * access message. Its time, grading scale and default minimum are refused the same way
 * (`refuseAuthorsEditionFields`). Its status, number and course have rules of their own.
 */
export function refuseAuthorsEditionStructure(
  req: PayloadRequest,
  data: Partial<CourseVersion>,
  before: CourseVersion | null,
): void {
  if (mayChangeStructure(req) || before?.status !== 'published') return
  if (editionStructure(data) !== editionStructure(before)) throw new Forbidden(req.t)
}

const EDITION_FIELDS = ['time', 'gradingScale', 'defaultMinimum'] as const

/**
 * Refuses a course author's save of a published edition that sets its time, grading scale or
 * default minimum to something else, with the edition's access message. Those fields' update
 * access drops them from a save (so the form greys them out), which would let the change pass
 * unseen; this runs on the data as sent, before that. A field sent as it is, as the form does for
 * one it loaded, is not a change.
 */
export async function refuseAuthorsEditionFields(
  req: PayloadRequest,
  id: unknown,
  data: Partial<CourseVersion> | undefined,
): Promise<void> {
  if (mayChangeStructure(req) || !data || (typeof id !== 'string' && typeof id !== 'number')) return
  const before = await req.payload.findByID({
    collection: 'course-versions',
    id,
    depth: 0,
    req,
    overrideAccess: true,
  })
  if (before.status !== 'published') return
  const value = (edition: Partial<CourseVersion>, field: (typeof EDITION_FIELDS)[number]) =>
    field === 'gradingScale' ? idOf(edition.gradingScale) : (edition[field] ?? null)
  const changed = EDITION_FIELDS.some(
    (field) => field in data && value(data, field) !== value(before, field),
  )
  if (changed) throw new Forbidden(req.t)
}

/**
 * Whether the signed-in person may change a published edition's fields other than its wording
 * (description, completion standard, its modules' titles and descriptions): the Training Admin
 * and leads. In a draft, whoever may save the edition.
 */
export const mayChangePublishedEdition = (req: PayloadRequest, edition: { status?: unknown }) =>
  edition.status !== 'published' || mayChangeStructure(req)

/** Checks both where the plan is and where the incoming data puts it. */
export async function refuseAuthorsLessonPlanStructure(
  req: PayloadRequest,
  data: Partial<LessonPlan>,
  /** The plan before this save, or null when it is being created. */
  before: LessonPlan | null,
): Promise<void> {
  if (mayChangeStructure(req)) return
  const to = idOf(data.courseVersion)
  const from = idOf(before?.courseVersion)
  if (to !== from && (await isPublished(req, to))) refuse('courseVersion', NEW_PLAN)
  if (
    before &&
    lessonPlanStructure(data) !== lessonPlanStructure(before) &&
    (await isPublished(req, from))
  ) {
    refuse('tasks', PLAN_STRUCTURE)
  }
}
