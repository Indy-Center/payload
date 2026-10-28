import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  ValidationError,
  type PayloadRequest,
} from 'payload'
import type { CourseVersion, LessonPlan, User } from '@/payload-types'
import { isStaff } from './access'
import { idOf } from './ids'
import { publishingFaults } from './publishing'

/**
 * What the course page does to editions (decisions 0056 and 0057): start one, publish a draft,
 * discard a draft. Starting and publishing are saves made as the signed-in person, through the
 * collections' own access rules and hooks. Discarding is the one deletion in courseware, so it
 * makes its own checks and then deletes below access.
 */

/** Set on the saves that copy an edition's lesson plans: a copy keeps its rows as they are. */
export const COPYING_EDITION = 'copyingEdition'

const refuse = (path: string, message: string): never => {
  throw new ValidationError({ errors: [{ path, message }] })
}

const staffOnly = (req: PayloadRequest, message: string) => {
  if (!isStaff(req.user as Pick<User, 'roles' | 'cid'> | null)) throw new APIError(message, 403)
}

/** Runs `work` in one transaction, so a refusal part way leaves nothing behind. */
export async function inTransaction<T>(req: PayloadRequest, work: () => Promise<T>): Promise<T> {
  const began = await initTransaction(req)
  try {
    const result = await work()
    if (began) await commitTransaction(req)
    return result
  } catch (error) {
    if (began) await killTransaction(req)
    throw error
  }
}

/** The course's draft edition, if it has one. A course has one at a time. */
export async function findDraft(
  req: PayloadRequest,
  courseId: string,
): Promise<CourseVersion | null> {
  const { docs } = await req.payload.find({
    collection: 'course-versions',
    where: { course: { equals: courseId }, status: { equals: 'draft' } },
    sort: '-number',
    limit: 1,
    depth: 0,
    req,
  })
  return docs[0] ?? null
}

/**
 * Starts a course's next edition as a draft. With a live edition it copies it: its fields, its
 * modules and its own lesson plans, each a new record (0008); scenarios and tasks are shared, so
 * the copies point at the same ones. With none it starts empty. Refused while a draft exists.
 */
export async function startEdition(req: PayloadRequest, courseId: string): Promise<CourseVersion> {
  const as = { req, user: req.user, overrideAccess: false, depth: 0 } as const
  const course = await req.payload.findByID({ collection: 'courses', id: courseId, ...as })
  const draft = await findDraft(req, courseId)
  if (draft) {
    refuse(
      'course',
      `${course.code} already has a draft, edition ${draft.number}. Publish or discard it before starting another.`,
    )
  }

  const liveId = idOf(course.currentVersion)
  const live = liveId
    ? await req.payload.findByID({ collection: 'course-versions', id: liveId, ...as })
    : null

  const started = await req.payload.create({
    collection: 'course-versions',
    data: {
      course: courseId,
      // Numbered on save, one more than the course's highest.
      number: 0,
      status: 'draft',
      description: live?.description,
      time: live?.time,
      completionStandard: live?.completionStandard,
      gradingScale: idOf(live?.gradingScale),
      defaultMinimum: live?.defaultMinimum,
    },
    ...as,
  })
  if (!live) return started

  const { docs: plans } = await req.payload.find({
    collection: 'lesson-plans',
    where: { courseVersion: { equals: live.id } },
    pagination: false,
    ...as,
  })
  const copies = new Map<string, string>()
  for (const plan of plans) {
    const copy = await req.payload.create({
      collection: 'lesson-plans',
      data: copyOfPlan(plan, started.id),
      context: { [COPYING_EDITION]: true },
      ...as,
    })
    copies.set(plan.id, copy.id)
  }

  return req.payload.update({
    collection: 'course-versions',
    id: started.id,
    data: {
      modules: (live.modules ?? []).map((module) => ({
        title: module.title,
        description: module.description,
        lessonPlans: (module.lessonPlans ?? [])
          .map((plan) => copies.get(idOf(plan)!))
          .filter((id): id is string => id !== undefined),
      })),
    },
    ...as,
  })
}

function copyOfPlan(plan: LessonPlan, courseVersion: string) {
  return {
    courseVersion,
    code: plan.code,
    title: plan.title,
    description: plan.description,
    body: plan.body,
    time: plan.time,
    isExam: plan.isExam,
    minimum: plan.minimum,
    theoryItems: (plan.theoryItems ?? []).map((item) => ({
      task: idOf(item.task)!,
      teacherNotes: item.teacherNotes,
    })),
    scenarios: (plan.scenarios ?? []).map((scenario) => idOf(scenario)!),
  }
}

async function draftOnly(
  req: PayloadRequest,
  versionId: string,
  published: (edition: number) => string,
) {
  const version = await req.payload.findByID({
    collection: 'course-versions',
    id: versionId,
    depth: 0,
    req,
    user: req.user,
    overrideAccess: false,
  })
  if (version.status !== 'draft') refuse('status', published(version.number))
  return version
}

const alreadyPublished = (edition: number) => `Edition ${edition} is already published.`

/** The faults that would stop a draft being published; none when it may be. */
export async function checkPublishing(req: PayloadRequest, versionId: string): Promise<string[]> {
  const version = await draftOnly(req, versionId, alreadyPublished)
  return publishingFaults(req, version)
}

/** Publishes a draft, as the Training Admin or a lead, through the collection's own save rules. */
export async function publishEdition(
  req: PayloadRequest,
  versionId: string,
): Promise<CourseVersion> {
  staffOnly(req, 'Only the Training Admin and leads publish an edition.')
  await draftOnly(req, versionId, alreadyPublished)
  return req.payload.update({
    collection: 'course-versions',
    id: versionId,
    data: { status: 'published' },
    req,
    user: req.user,
    overrideAccess: false,
    depth: 0,
  })
}

/**
 * Discards a draft that was never published, with its own lesson plans (0057). Nobody was ever
 * assigned it and nothing points at it. Only the Training Admin and leads discard, and a published
 * edition never is. Courseware's access rules refuse every delete, so after these checks the
 * deletes go below them.
 */
export async function discardDraft(
  req: PayloadRequest,
  versionId: string,
): Promise<{ number: number; lessonPlans: number }> {
  staffOnly(req, 'Only the Training Admin and leads discard a draft.')
  const version = await draftOnly(
    req,
    versionId,
    (edition) =>
      `Edition ${edition} is published, so it can’t be discarded. A published edition is kept.`,
  )
  const { docs } = await req.payload.delete({
    collection: 'lesson-plans',
    where: { courseVersion: { equals: version.id } },
    req,
    overrideAccess: true,
  })
  await req.payload.delete({
    collection: 'course-versions',
    id: version.id,
    req,
    overrideAccess: true,
  })
  return { number: version.number, lessonPlans: docs.length }
}
