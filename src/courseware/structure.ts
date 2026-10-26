import { ValidationError, type PayloadRequest } from 'payload'
import type { LessonPlan, Scenario, User } from '@/payload-types'
import { isStaff } from './access'
import { idOf } from './ids'

/**
 * What only the Training Admin and leads may change in a published edition (decision 0055). A
 * course author keeps editing their course's wording and teacher notes there; its structure is the
 * staff's. In a draft a course author changes anything, as before. The edition's own record is
 * drafts-only for a course author already (`courseVersionAccess`).
 *
 * A save made without a user, such as a script on the Local API, is not limited.
 */

type Ref = string | { id: string } | null | undefined
const ids = (refs: readonly Ref[] | null | undefined) => (refs ?? []).map(idOf)

const NEEDS_A_LEAD = 'which needs the Training Admin or a lead.'
const WORDING_STILL = 'Its wording and teacher notes can still change.'
const NEW_PLAN = `This edition is published, so adding a lesson plan to it is a structural change, ${NEEDS_A_LEAD}`
const PLAN_STRUCTURE = `This lesson plan is in a published edition, so changing its theory items, their order, its minimum, the scenarios it offers or its edition is a structural change, ${NEEDS_A_LEAD} ${WORDING_STILL}`
const SCENARIO_STRUCTURE = `A published edition offers this scenario, so changing its practical tasks or their required flags is a structural change, ${NEEDS_A_LEAD} ${WORDING_STILL}`

const refuse = (path: string, message: string): never => {
  throw new ValidationError({ errors: [{ path, message }] })
}

const mayChangeStructure = (req: PayloadRequest) =>
  !req.user || isStaff(req.user as Pick<User, 'roles' | 'cid'>)

function lessonPlanStructure(plan: Partial<LessonPlan>): string {
  return JSON.stringify([
    idOf(plan.courseVersion),
    plan.minimum ?? null,
    (plan.theoryItems ?? []).map((item) => [item.id, idOf(item.task)]),
    ids(plan.scenarios),
  ])
}

function practicalTaskStructure(scenario: Partial<Scenario>): string {
  return JSON.stringify(
    (scenario.practicalTasks ?? []).map((row) => [row.id, idOf(row.task), row.required !== false]),
  )
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
    refuse('theoryItems', PLAN_STRUCTURE)
  }
}

export async function refuseAuthorsScenarioStructure(
  req: PayloadRequest,
  data: Partial<Scenario>,
  /** The scenario before this save, or null when it is being created. */
  before: Scenario | null,
): Promise<void> {
  if (mayChangeStructure(req) || !before) return
  if (practicalTaskStructure(data) === practicalTaskStructure(before)) return
  const offered = await req.payload.count({
    collection: 'lesson-plans',
    where: {
      scenarios: { equals: before.id },
      'courseVersion.status': { equals: 'published' },
    },
    req,
  })
  if (offered.totalDocs > 0) refuse('practicalTasks', SCENARIO_STRUCTURE)
}
