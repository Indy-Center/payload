import type { PayloadRequest } from 'payload'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type {
  CourseVersion,
  LessonPlan as LessonPlanRecord,
  Scenario as ScenarioRecord,
} from '@/payload-types'
import type {
  CourseList,
  CourseVersionDocument,
  GradePoint,
  LessonPlan,
  Scenario,
  ScenarioPosition,
  TaskRef,
} from './document'
import { estimateCourse } from './estimated-weeks'
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
  const positionOf = await loadScenarioPositions(
    req,
    scenarios.docs.flatMap((record) => [record.studentPosition, record.teacherPosition]),
  )
  const scenariosById = new Map(
    scenarios.docs.map((record) => [record.id, scenario(record, tree, positionOf)]),
  )
  const scaleId = idOf(version.gradingScale)
  const scale = scaleId
    ? await payload.findByID({ collection: 'grading-scales', id: scaleId, depth: 0, req })
    : null
  const points: GradePoint[] = (scale?.points ?? []).map((point, index) => ({
    position: index + 1,
    label: point.label,
    description: point.description ?? '',
  }))
  const point = (position: number | null | undefined) =>
    points.find((candidate) => candidate.position === position) ?? null
  const codeOf = await loadCredentialCodes(req, [
    ...(course.prerequisites ?? []).flatMap((row) => row.anyOf ?? []),
    course.credentialIssued,
  ])

  return {
    course: {
      id: course.id,
      code: course.code,
      title: course.title,
      authors: course.authors ?? [],
      prerequisitesNote: course.prerequisitesNote ?? '',
      // Saving keeps hours and position types together, so hours alone say whether it is set.
      consolidation:
        course.consolidation?.hours != null
          ? {
              hours: course.consolidation.hours,
              positionTypes: course.consolidation.positionTypes ?? [],
            }
          : null,
      ratingExam: course.ratingExam === 'none' ? null : (course.ratingExam ?? null),
      academyExam: course.academyExam === 'none' ? null : (course.academyExam ?? null),
      estimatedWeeks: (await estimateCourse(req, course))?.weeks ?? null,
      moodleUrl: course.moodleUrl || null,
      prerequisites: (course.prerequisites ?? []).map((row) => ({
        anyOf: (row.anyOf ?? []).map(codeOf).filter((code): code is string => code !== null),
      })),
      credentialIssued: codeOf(course.credentialIssued),
    },
    version: {
      id: version.id,
      number: version.number,
      status: version.status,
      description: version.description ?? '',
      time: version.time ?? null,
      completionStandard: version.completionStandard ?? '',
      updatedAt: version.updatedAt,
    },
    scale: scale ? { id: scale.id, name: scale.name, points } : null,
    defaultMinimum: point(version.defaultMinimum),
    modules: (version.modules ?? []).map((module) => ({
      id: module.id ?? '',
      title: module.title,
      description: module.description ?? '',
      lessonPlans: (module.lessonPlans ?? [])
        .map((plan) => plansById.get(idOf(plan) ?? ''))
        .filter((plan): plan is LessonPlanRecord => plan !== undefined)
        .map((plan) => ({
          ...lessonPlan(plan, tree, scenariosById),
          minimum: point(plan.minimum),
        })),
    })),
  }
}

/** Looks up the codes of the named credentials, retired ones included. */
async function loadCredentialCodes(
  req: PayloadRequest,
  named: (string | { id: string } | null | undefined)[],
): Promise<(credential: string | { id: string } | null | undefined) => string | null> {
  const ids = [...new Set(named.map(idOf).filter((id): id is string => id !== null))]
  const { docs } =
    ids.length === 0
      ? { docs: [] }
      : await req.payload.find({
          collection: 'credentials',
          where: { id: { in: ids } },
          select: { code: true },
          pagination: false,
          depth: 0,
          req,
        })
  const codes = new Map(docs.map((credential) => [credential.id, credential.code]))
  return (credential) => codes.get(idOf(credential) ?? '') ?? null
}

function taskRef(tree: TaskTree, task: string | { id: string }): TaskRef {
  const id = idOf(task)!
  return { id, number: tree.number(id), name: tree.get(id)?.name ?? '' }
}

/**
 * Looks up the named positions as a scenario serves them, `{ id: vNAS id, callsign }`, retired
 * ones included: a position vNAS has dropped stays on the scenario that names it.
 */
async function loadScenarioPositions(
  req: PayloadRequest,
  named: (string | { id: string } | null | undefined)[],
): Promise<(position: string | { id: string }) => ScenarioPosition> {
  const ids = [...new Set(named.map(idOf).filter((id): id is string => id !== null))]
  const { docs } =
    ids.length === 0
      ? { docs: [] }
      : await req.payload.find({
          collection: 'positions',
          where: { id: { in: ids } },
          select: { vnasId: true, callsign: true },
          pagination: false,
          depth: 0,
          req,
        })
  const served = new Map(
    docs.map((position) => [position.id, { id: position.vnasId, callsign: position.callsign }]),
  )
  // A scenario's positions are required and never deleted, so every one is found.
  return (position) => served.get(idOf(position)!)!
}

function scenario(
  record: ScenarioRecord,
  tree: TaskTree,
  positionOf: (position: string | { id: string }) => ScenarioPosition,
): Scenario {
  return {
    id: record.id,
    name: record.name,
    airport: record.airport,
    studentPosition: positionOf(record.studentPosition),
    teacherPosition: positionOf(record.teacherPosition),
    difficulty: record.difficulty ?? null,
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
  scenarios: Map<string, Scenario>,
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
      .filter((offered): offered is Scenario => offered !== undefined),
  }
}
