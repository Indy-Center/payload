import type { PayloadRequest } from 'payload'
import { idOf } from '@/courseware/ids'
import type { Course, LessonPlan, Position, Scenario } from '@/payload-types'
import { loadEditions } from './editions'

/** A scenario as the Scenarios tab lists it. */
export type ScenarioRow = {
  id: string
  name: string
  /** The student position's callsign. */
  studentPosition: string | null
  difficulty: string | null
  description: string | null
  retired: boolean
}

/** A lesson plan of the edition read, with the scenarios it offers. */
export type OfferingPlan = {
  id: string
  code: string | null
  title: string | null
  scenarios: ScenarioRow[]
}

export type ScenarioTab = {
  /** The edition that says which lesson plans offer what: the draft, else the live one. */
  edition: { number: number; status: 'draft' | 'live' } | null
  /** Each lesson plan that offers a scenario, in outline order. */
  offered: OfferingPlan[]
  /** Scenarios no lesson plan of that edition offers, retired ones left to `retired`. */
  offeredByNone: ScenarioRow[]
  retired: ScenarioRow[]
}

const DIFFICULTY: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

const row = (scenario: Scenario): ScenarioRow => {
  const student = scenario.studentPosition as Position | string | null | undefined
  return {
    id: scenario.id,
    name: scenario.name,
    studentPosition: typeof student === 'object' && student ? student.callsign : null,
    difficulty: scenario.difficulty ? (DIFFICULTY[scenario.difficulty] ?? null) : null,
    description: scenario.description ?? null,
    retired: scenario.retired === true,
  }
}

/** The edition the tab reads: the draft if there is one, else the live edition. */
async function editionRead(req: PayloadRequest, course: Course) {
  const { draft, live } = await loadEditions(req, course)
  if (draft) return { id: draft.id, number: draft.number, status: 'draft' as const }
  if (live) return { id: live.id, number: live.number, status: 'live' as const }
  return null
}

/**
 * An edition's lesson plans in outline order: each module's in order, then those in no module by
 * code, as the Content tab lists them.
 */
async function plansInOrder(req: PayloadRequest, editionId: string): Promise<LessonPlan[]> {
  const as = { req, user: req.user, overrideAccess: false, depth: 0 } as const
  const edition = await req.payload.findByID({
    collection: 'course-versions',
    id: editionId,
    ...as,
  })
  const { docs } = await req.payload.find({
    collection: 'lesson-plans',
    where: { courseVersion: { equals: editionId } },
    sort: 'code',
    pagination: false,
    ...as,
  })
  const byId = new Map(docs.map((plan) => [plan.id, plan]))
  const placed = (edition.modules ?? []).flatMap((module) =>
    (module.lessonPlans ?? []).map((plan) => byId.get(idOf(plan)!)),
  )
  const ordered = placed.filter((plan): plan is LessonPlan => plan !== undefined)
  const seen = new Set(ordered.map((plan) => plan.id))
  return [...ordered, ...docs.filter((plan) => !seen.has(plan.id))]
}

/**
 * The course's scenarios as the Scenarios tab groups them: under each lesson plan that offers them
 * in the edition read, in outline order (one offered by two lesson plans is under both); then
 * those offered by none; then the retired ones. With no edition, every scenario is offered by none.
 */
export async function loadScenarioTab(req: PayloadRequest, course: Course): Promise<ScenarioTab> {
  const { docs } = await req.payload.find({
    collection: 'scenarios',
    where: { course: { equals: course.id } },
    sort: 'name',
    depth: 1,
    pagination: false,
    req,
    user: req.user,
    overrideAccess: false,
  })
  const rows = new Map(docs.map((scenario) => [scenario.id, row(scenario)]))
  const edition = await editionRead(req, course)
  const plans = edition ? await plansInOrder(req, edition.id) : []

  const offered: OfferingPlan[] = []
  const offeredIds = new Set<string>()
  for (const plan of plans) {
    const scenarios = (plan.scenarios ?? [])
      .map((scenario) => rows.get(idOf(scenario)!))
      .filter((scenario): scenario is ScenarioRow => scenario !== undefined)
    if (scenarios.length === 0) continue
    scenarios.forEach((scenario) => offeredIds.add(scenario.id))
    offered.push({ id: plan.id, code: plan.code ?? null, title: plan.title ?? null, scenarios })
  }
  const all = [...rows.values()]
  return {
    edition: edition && { number: edition.number, status: edition.status },
    offered,
    offeredByNone: all.filter((scenario) => !scenario.retired && !offeredIds.has(scenario.id)),
    retired: all.filter((scenario) => scenario.retired),
  }
}

/**
 * The lesson plans of the edition the Scenarios tab reads that offer one scenario, for its form:
 * that edition, and each plan's code and title.
 */
export async function loadOfferedBy(
  req: PayloadRequest,
  scenario: { id: string; course: string | { id: string } | null | undefined },
): Promise<{
  edition: ScenarioTab['edition']
  plans: { code: string | null; title: string | null }[]
}> {
  const courseId = idOf(scenario.course)
  if (!courseId) return { edition: null, plans: [] }
  const course = await req.payload.findByID({
    collection: 'courses',
    id: courseId,
    depth: 0,
    req,
    user: req.user,
    overrideAccess: false,
  })
  const edition = await editionRead(req, course)
  if (!edition) return { edition: null, plans: [] }
  const plans = (await plansInOrder(req, edition.id)).filter((plan) =>
    (plan.scenarios ?? []).some((offered) => idOf(offered) === scenario.id),
  )
  return {
    edition: { number: edition.number, status: edition.status },
    plans: plans.map((plan) => ({ code: plan.code ?? null, title: plan.title ?? null })),
  }
}
