import { ValidationError, type PayloadRequest } from 'payload'
import type { CourseVersion } from '@/payload-types'
import { idOf } from './ids'

/**
 * Edition numbers (decision 0056). A new course version is numbered one more than the highest in
 * its course, starting at 1; after that its number never changes. A number sent with a save is
 * ignored. Two editions of one course never share a number: a version moved into a course that
 * already has its number is refused here, and the unique index on (course, number) refuses what
 * this cannot see, such as two editions of one course started at the same moment.
 */
export async function numberEdition(
  req: PayloadRequest,
  data: Partial<CourseVersion>,
  /** The version before this save; null when it is being created, even as a duplicate. */
  before: CourseVersion | null,
): Promise<void> {
  const courseId = idOf(data.course ?? before?.course)
  if (!courseId) return

  if (!before) {
    data.number = (await highestNumber(req, courseId)) + 1
    return
  }

  data.number = before.number
  if (courseId === idOf(before.course)) return
  const taken = await req.payload.count({
    collection: 'course-versions',
    where: { course: { equals: courseId }, number: { equals: data.number } },
    req,
  })
  if (taken.totalDocs > 0) {
    const course = await req.payload.findByID({
      collection: 'courses',
      id: courseId,
      depth: 0,
      req,
    })
    throw new ValidationError({
      errors: [
        { path: 'number', message: `${course.code} already has an edition ${data.number}.` },
      ],
    })
  }
}

async function highestNumber(req: PayloadRequest, courseId: string): Promise<number> {
  const { docs } = await req.payload.find({
    collection: 'course-versions',
    where: { course: { equals: courseId } },
    sort: '-number',
    limit: 1,
    depth: 0,
    select: { number: true },
    req,
  })
  return docs[0]?.number ?? 0
}
