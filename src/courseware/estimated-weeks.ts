import type { PayloadRequest } from 'payload'
import type { Course } from '@/payload-types'
import { idOf } from './ids'

export type Weeks = { min: number; max: number }

/** A course's estimated length, and where it comes from. */
export type CourseEstimate =
  { from: 'override'; weeks: Weeks } | { from: 'edition'; edition: number; weeks: Weeks }

/**
 * A lesson is a lesson (0058): one lesson plan a week on the short end, and 20% more on the long
 * end, rounded up. Ten lesson plans read 10–12 weeks. No lesson plans, no estimate.
 */
export function weeksFor(lessonPlans: number): Weeks | null {
  if (lessonPlans <= 0) return null
  return { min: lessonPlans, max: Math.ceil((lessonPlans * 12) / 10) }
}

/** The course's own fewest and most weeks, when both are given. */
export function overrideOf(course: Pick<Course, 'estimatedWeeks'>): Weeks | null {
  const { min, max } = course.estimatedWeeks ?? {}
  return min != null && max != null ? { min, max } : null
}

/**
 * The range worked out from the course's live edition, counting every lesson plan of that
 * edition, in a module or not, or null with no live edition.
 */
export async function workedOutWeeks(
  req: PayloadRequest,
  course: Pick<Course, 'currentVersion'>,
): Promise<{ edition: number; weeks: Weeks } | null> {
  const liveId = idOf(course.currentVersion)
  if (!liveId) return null
  // These reads skip access on purpose: the course document is served to key holders with no
  // user, as the rest of `buildCourseVersionDocument` reads, and only a count leaves here.
  const live = await req.payload.findByID({
    collection: 'course-versions',
    id: liveId,
    depth: 0,
    disableErrors: true,
    req,
  })
  if (!live) return null
  const { totalDocs } = await req.payload.count({
    collection: 'lesson-plans',
    where: { courseVersion: { equals: live.id } },
    req,
  })
  const weeks = weeksFor(totalDocs)
  return weeks ? { edition: live.number, weeks } : null
}

/** The override if set, otherwise the worked-out range, otherwise none (0058). */
export async function estimateCourse(
  req: PayloadRequest,
  course: Pick<Course, 'currentVersion' | 'estimatedWeeks'>,
): Promise<CourseEstimate | null> {
  const override = overrideOf(course)
  if (override) return { from: 'override', weeks: override }
  const worked = await workedOutWeeks(req, course)
  return worked ? { from: 'edition', ...worked } : null
}
