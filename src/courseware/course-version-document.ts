import type { PayloadRequest } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type { CourseVersion, LessonPlan as LessonPlanRecord } from '@/payload-types'
import type { CourseVersionDocument, LessonPlan } from './document'

/** The id of a relationship, whether it came back populated or not. */
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

/**
 * The version of a course that "current" or "draft" names, or null. Current is whichever version
 * the course points at; draft is its newest draft.
 */
export async function findCourseVersion(
  req: PayloadRequest,
  code: string,
  which: 'current' | 'draft',
): Promise<{ courseId: string; versionId: string } | null> {
  const { docs } = await req.payload.find({
    collection: 'courses',
    where: { code: { equals: code } },
    depth: 0,
    limit: 1,
    req,
  })
  const course = docs[0]
  if (!course) return null

  if (which === 'current') {
    const versionId = idOf(course.currentVersion)
    return versionId ? { courseId: course.id, versionId } : null
  }

  const drafts = await req.payload.find({
    collection: 'course-versions',
    where: { course: { equals: course.id }, status: { equals: 'draft' } },
    sort: '-number',
    depth: 0,
    limit: 1,
    req,
  })
  const draft = drafts.docs[0]
  return draft ? { courseId: course.id, versionId: draft.id } : null
}

/** One whole course version, resolved, in the shape `document.ts` promises. */
export async function buildCourseVersionDocument(
  req: PayloadRequest,
  versionId: string,
): Promise<CourseVersionDocument> {
  const { payload } = req
  const version: CourseVersion = await payload.findByID({
    collection: 'course-versions',
    id: versionId,
    depth: 0,
    req,
  })
  const course = await payload.findByID({
    collection: 'courses',
    id: idOf(version.course)!,
    depth: 0,
    req,
  })

  const plans = await payload.find({
    collection: 'lesson-plans',
    where: { courseVersion: { equals: version.id } },
    pagination: false,
    // Deep enough to fill in images in the body.
    depth: 1,
    req,
  })
  const plansById = new Map(plans.docs.map((plan) => [plan.id, plan]))

  return {
    course: {
      id: course.id,
      code: course.code,
      title: course.title,
      authors: course.authors ?? [],
    },
    version: {
      id: version.id,
      number: version.number,
      status: version.status,
      description: version.description ?? '',
      time: version.time ?? null,
      academyRequired: version.academyRequired ?? false,
      updatedAt: version.updatedAt,
    },
    scale: null,
    defaultMinimum: null,
    modules: (version.modules ?? []).map((module) => ({
      id: module.id ?? '',
      title: module.title,
      description: module.description ?? '',
      lessonPlans: (module.lessonPlans ?? [])
        .map((plan) => plansById.get(idOf(plan) ?? ''))
        .filter((plan): plan is LessonPlanRecord => plan !== undefined)
        .map(lessonPlan),
    })),
  }
}

function lessonPlan(plan: LessonPlanRecord): LessonPlan {
  return {
    id: plan.id,
    code: plan.code ?? '',
    title: plan.title ?? '',
    description: plan.description ?? '',
    bodyHtml: plan.body
      ? convertLexicalToHTML({ data: plan.body as SerializedEditorState, disableContainer: true })
      : '',
    time: plan.time ?? null,
    isExam: plan.isExam ?? false,
    minimum: null,
    theoryItems: [],
    scenarios: [],
  }
}
