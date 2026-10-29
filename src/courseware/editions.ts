import { ValidationError, type PayloadRequest } from 'payload'
import type { CourseVersion } from '@/payload-types'
import { idOf } from './ids'

/**
 * Edition numbers (decision 0056). A new course version is numbered one more than the highest in
 * its course, starting at 1; after that its number never changes, and neither does its course
 * (a change of course is refused). A number sent with a save is ignored. Two editions of one
 * course never share a number: the unique index on (course, number) refuses what numbering cannot
 * see, such as two editions of one course started at the same moment.
 */
export async function numberEdition(
  req: PayloadRequest,
  data: Partial<CourseVersion>,
  /** The version before this save; null when it is being created. */
  before: CourseVersion | null,
): Promise<void> {
  const courseId = idOf(data.course ?? before?.course)
  if (!courseId) return

  if (!before) {
    data.number = (await highestNumber(req, courseId)) + 1
    return
  }

  data.number = before.number
  if (courseId !== idOf(before.course)) {
    throw new ValidationError({
      errors: [
        {
          path: 'course',
          message:
            'An edition stays with its course once it is saved. Start a new edition of the other course instead.',
        },
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
