import type { Access, CollectionConfig, FieldAccess, PayloadRequest, Where } from 'payload'
import type { User } from '@/payload-types'
import { idOf } from './ids'

/**
 * Who may do what in courseware (decisions 0018, 0022, 0026, 0039).
 *
 * - The Training Admin (`training:admin`) and lead instructors (`training:lead`) do everything:
 *   edit and publish, keep the task list, retire, and manage CMS accounts.
 * - A course author, named by CID on a course, edits that course's drafts, lesson plans and
 *   scenarios, and nothing else. They cannot publish or retire.
 *
 * Nothing in courseware is ever deleted: a published course version may use any record, and a
 * mistaken click must not take it away. Tasks and scenarios are retired instead.
 *
 * The rules read only `user.roles` and `user.cid`. For now those are fields on the CMS's own
 * accounts that only the Training Admin sets; once the CMS signs in through identity (DEV-219)
 * they come from identity, and only sign-in changes.
 */
export const ROLES = ['training:admin', 'training:lead'] as const

type Person = Pick<User, 'roles' | 'cid'> | null | undefined
const person = (req: PayloadRequest) => req.user as Person

export const isTrainingAdmin = (user: Person) => Boolean(user?.roles?.includes('training:admin'))

/** The Training Admin or a lead instructor. */
export const isStaff = (user: Person) =>
  Boolean(user?.roles?.some((role) => (ROLES as readonly string[]).includes(role)))

/** Ids of the courses that name this user's CID as an author. */
async function authoredCourseIds(req: PayloadRequest): Promise<string[]> {
  const cid = person(req)?.cid
  if (!cid) return []
  const { docs } = await req.payload.find({
    collection: 'courses',
    where: { authors: { equals: cid } },
    pagination: false,
    depth: 0,
    req,
  })
  return docs.map((course) => course.id)
}

const signedIn: Access = ({ req }) => Boolean(req.user)
const staffOnly: Access = ({ req }) => isStaff(person(req))
export const staffOnlyField: FieldAccess = ({ req }) => isStaff(person(req))

/** Read by anyone signed in, written by the Training Admin and leads, never deleted. */
export const staffAccess: CollectionConfig['access'] = {
  read: signedIn,
  create: staffOnly,
  update: staffOnly,
  delete: () => false,
}

/**
 * Staff anywhere; a course author on their own courses, given the path from the record to its
 * course and, for creating, a way to find the course a new record belongs to.
 */
function authoredAccess(options: {
  coursePath: string
  courseOf: (req: PayloadRequest, data: Record<string, unknown>) => Promise<string | null>
  /** A further limit on what an author may update, such as drafts only. */
  authorWhere?: Where
}): CollectionConfig['access'] {
  return {
    read: signedIn,
    create: async ({ req, data }) => {
      if (isStaff(person(req))) return true
      const courseId = await options.courseOf(req, data ?? {})
      return courseId !== null && (await authoredCourseIds(req)).includes(courseId)
    },
    update: async ({ req, data }) => {
      if (isStaff(person(req))) return true
      const ids = await authoredCourseIds(req)
      if (ids.length === 0) return false
      // Moving a record to another course needs that course too, not only the one it is in now.
      const movingTo = data ? await options.courseOf(req, data) : null
      if (movingTo !== null && !ids.includes(movingTo)) return false
      const mine: Where = { [options.coursePath]: { in: ids } }
      return options.authorWhere ? { and: [mine, options.authorWhere] } : mine
    },
    delete: () => false,
  }
}

async function courseOfVersion(req: PayloadRequest, versionId: string | null) {
  if (!versionId) return null
  const version = await req.payload.findByID({
    collection: 'course-versions',
    id: versionId,
    depth: 0,
    req,
  })
  return idOf(version.course)
}

/** Authors edit their courses' drafts only; a published version is the staff's. */
export const courseVersionAccess = authoredAccess({
  coursePath: 'course',
  courseOf: async (_req, data) => idOf(data.course as string),
  authorWhere: { status: { equals: 'draft' } },
})

export const lessonPlanAccess = authoredAccess({
  coursePath: 'courseVersion.course',
  courseOf: (req, data) => courseOfVersion(req, idOf(data.courseVersion as string)),
})

export const scenarioAccess = authoredAccess({
  coursePath: 'course',
  courseOf: async (_req, data) => idOf(data.course as string),
})

const selfOrStaff: Access = ({ req }) =>
  isStaff(person(req)) || (req.user ? { id: { equals: req.user.id } } : false)

/** CMS accounts are managed by the Training Admin and leads; anyone may read and edit their own. */
export const userAccess: CollectionConfig['access'] = {
  read: selfOrStaff,
  create: staffOnly,
  update: selfOrStaff,
  delete: staffOnly,
}

/**
 * Roles and CID are set by the Training Admin alone, or by anyone signed in while no account
 * holds `training:admin` yet, so that the first one can be given it.
 */
export const trainingAdminField: FieldAccess = async ({ req }) => {
  if (isTrainingAdmin(person(req))) return true
  if (!req.user) return false
  const admins = await req.payload.count({
    collection: 'users',
    where: { roles: { contains: 'training:admin' } },
    req,
  })
  return admins.totalDocs === 0
}
