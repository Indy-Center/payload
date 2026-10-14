import type { PayloadRequest } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type {
  CourseVersion,
  LessonPlan as LessonPlanRecord,
  Scenario as ScenarioRecord,
} from '@/payload-types'
import type { CourseList, CourseVersionDocument, LessonPlan, Scenario, TaskRef } from './document'
import { idOf } from './ids'
import { loadTaskTree, type TaskTree } from './task-tree'

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

/** Every course, by code, with its current version and its newest draft. */
export async function buildCourseList(req: PayloadRequest): Promise<CourseList> {
  const [courses, versions] = await Promise.all([
    req.payload.find({ collection: 'courses', sort: 'code', pagination: false, depth: 0, req }),
    req.payload.find({
      collection: 'course-versions',
      pagination: false,
      depth: 0,
      select: { course: true, number: true, status: true },
      req,
    }),
  ])

  return {
    courses: courses.docs.map((course) => {
      const currentId = idOf(course.currentVersion)
      const current = versions.docs.find((version) => version.id === currentId)
      const draft = versions.docs
        .filter((version) => idOf(version.course) === course.id && version.status === 'draft')
        .sort((a, b) => b.number - a.number)[0]
      return {
        id: course.id,
        code: course.code,
        title: course.title,
        authors: course.authors ?? [],
        currentVersion: current ? { id: current.id, number: current.number } : null,
        draftVersion: draft ? { id: draft.id, number: draft.number } : null,
      }
    }),
  }
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
  const tree = await loadTaskTree(req)
  const scenarios = await payload.find({
    collection: 'scenarios',
    where: { course: { equals: course.id } },
    pagination: false,
    depth: 0,
    req,
  })
  const scenariosById = new Map(scenarios.docs.map((scenario) => [scenario.id, scenario]))

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
        .map((plan) => lessonPlan(plan, tree, scenariosById)),
    })),
  }
}

function taskRef(tree: TaskTree, task: string | { id: string }): TaskRef {
  const id = idOf(task)!
  return { id, number: tree.number(id), name: tree.get(id)?.name ?? '' }
}

function scenario(record: ScenarioRecord, tree: TaskTree): Scenario {
  return {
    id: record.id,
    name: record.name,
    airport: record.airport,
    position: record.position,
    difficulty: record.difficulty ?? '',
    mode: record.mode,
    retired: record.retired ?? false,
    practicalTasks: (record.practicalTasks ?? []).map((row) => ({
      id: row.id ?? '',
      task: taskRef(tree, row.task),
      teacherNotes: row.teacherNotes ?? '',
      required: row.required ?? true,
    })),
  }
}

function lessonPlan(
  plan: LessonPlanRecord,
  tree: TaskTree,
  scenarios: Map<string, ScenarioRecord>,
): LessonPlan {
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
    theoryItems: (plan.theoryItems ?? []).map((item) => ({
      id: item.id ?? '',
      task: taskRef(tree, item.task),
      teacherNotes: item.teacherNotes ?? '',
    })),
    scenarios: (plan.scenarios ?? [])
      .map((offered) => scenarios.get(idOf(offered) ?? ''))
      .filter((offered): offered is ScenarioRecord => offered !== undefined)
      .map((offered) => scenario(offered, tree)),
  }
}
