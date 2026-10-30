import type { PayloadRequest } from 'payload'
import { isStaff } from '@/courseware/access'
import { idOf } from '@/courseware/ids'
import type { Course, CourseVersion, GradingScale, LessonPlan, User } from '@/payload-types'

/** One edition as the course page shows it. */
export type EditionSummary = {
  id: string
  number: number
  publishedAt: string | null
  /** Lesson plans placed in its modules. */
  lessonPlans: number
}

/** A course's editions, sorted into the live one, its draft, and those the live one replaced. */
export type CourseEditions = {
  live: EditionSummary | null
  draft: EditionSummary | null
  /** Published before the live edition, newest first. */
  replaced: EditionSummary[]
}

const summary = (edition: CourseVersion): EditionSummary => ({
  id: edition.id,
  number: edition.number,
  publishedAt: edition.publishedAt ?? null,
  lessonPlans: (edition.modules ?? []).reduce(
    (count, module) => count + (module.lessonPlans?.length ?? 0),
    0,
  ),
})

export async function loadEditions(req: PayloadRequest, course: Course): Promise<CourseEditions> {
  const { docs } = await req.payload.find({
    collection: 'course-versions',
    where: { course: { equals: course.id } },
    sort: '-number',
    depth: 0,
    pagination: false,
    req,
    user: req.user,
    overrideAccess: false,
  })
  const liveId = idOf(course.currentVersion)
  const live = docs.find((edition) => edition.id === liveId)
  const draft = docs.find((edition) => edition.status === 'draft')
  const replaced = docs
    .filter((edition) => edition.status === 'published' && edition.id !== liveId)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || b.number - a.number)
  return {
    live: live ? summary(live) : null,
    draft: draft ? summary(draft) : null,
    replaced: replaced.map(summary),
  }
}

/** An edition's outline as the Content and History tabs show it. */
export type EditionOutline = {
  id: string
  title: string
  number: number
  gradingScale: string | null
  defaultMinimum: number | null
  completionStandard: string | null
  modules: {
    key: string
    title: string
    description: string | null
    lessonPlans: OutlinePlan[]
  }[]
  /** The edition's own lesson plans that no module holds. */
  unplaced: OutlinePlan[]
  /** All of the edition's own lesson plans, placed in a module or not. */
  ownLessonPlans: number
}

/** A lesson plan as a module lists it. */
export type OutlinePlan = {
  id: string
  code: string | null
  title: string | null
  minutes: number | null
  theoryItems: number
}

const outlinePlan = (plan: LessonPlan): OutlinePlan => ({
  id: plan.id,
  code: plan.code ?? null,
  title: plan.title ?? null,
  minutes: plan.time ?? null,
  theoryItems: plan.theoryItems?.length ?? 0,
})

export async function loadOutline(req: PayloadRequest, id: string): Promise<EditionOutline> {
  const as = { req, user: req.user, overrideAccess: false } as const
  const edition = await req.payload.findByID({ collection: 'course-versions', id, depth: 1, ...as })
  const { docs: own } = await req.payload.find({
    collection: 'lesson-plans',
    where: { courseVersion: { equals: id } },
    sort: 'code',
    depth: 0,
    pagination: false,
    ...as,
  })
  const placed = new Set(
    (edition.modules ?? []).flatMap((module) => (module.lessonPlans ?? []).map(idOf)),
  )
  const scale = edition.gradingScale as GradingScale | string | null | undefined
  return {
    id: edition.id,
    title: edition.title ?? `Edition ${edition.number}`,
    number: edition.number,
    gradingScale: typeof scale === 'object' && scale ? scale.name : null,
    defaultMinimum: edition.defaultMinimum ?? null,
    completionStandard: edition.completionStandard ?? null,
    modules: (edition.modules ?? []).map((module, index) => ({
      key: module.id ?? String(index),
      title: module.title,
      description: module.description ?? null,
      lessonPlans: (module.lessonPlans ?? [])
        .filter((plan): plan is LessonPlan => typeof plan === 'object')
        .map(outlinePlan),
    })),
    unplaced: own.filter((plan) => !placed.has(plan.id)).map(outlinePlan),
    ownLessonPlans: own.length,
  }
}

type Person = Pick<User, 'roles' | 'cid'> | null | undefined

/** What the signed-in person may do from the course page; the endpoints check it again. */
export function abilities(req: PayloadRequest, course: Course) {
  const user = req.user as Person
  const staff = isStaff(user)
  const author = Boolean(user?.cid && (course.authors ?? []).includes(user.cid))
  return { start: staff || author, publish: staff, discard: staff }
}

/** "3 Nov 2026", or a dash for an edition published before dates were kept. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
