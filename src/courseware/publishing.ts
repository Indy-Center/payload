import { ValidationError, type PayloadRequest } from 'payload'
import type { CourseVersion, Scenario } from '@/payload-types'
import { idOf } from './ids'
import { inScale } from './minimums'

const refuse = (path: string, messages: string[]): never => {
  throw new ValidationError({ errors: messages.map((message) => ({ path, message })) })
}

/**
 * The only lock on a published course version (decision 0055): it stays published, and its grading
 * scale cannot be swapped, because grades are stored as a point's position on it. Everything else
 * stays editable; who may change its structure is a permission (`structure.ts`).
 */
export function refuseScaleChange(
  data: Partial<CourseVersion>,
  originalDoc: CourseVersion | undefined,
): void {
  if (originalDoc?.status !== 'published') return
  if (data.status !== 'published') {
    refuse('status', ['A published course version stays published.'])
  }
  if (idOf(data.gradingScale) !== idOf(originalDoc.gradingScale)) {
    refuse('gradingScale', [
      'This edition is published, so its grading scale cannot change: grades already given are points on it.',
    ])
  }
}

/**
 * The publishing check (decision 0034): the version names a scale; every lesson plan has a code, a
 * title, a minimum, and at least one theory item or scenario; nothing it uses is retired. Unmapped
 * tasks do not block (0020). Refuses with every fault, each naming its record.
 */
export async function refuseUnpublishable(
  req: PayloadRequest,
  version: Partial<CourseVersion>,
): Promise<void> {
  const faults = await publishingFaults(req, version)
  if (faults.length > 0) refuse('status', faults)
}

/** Every fault the publishing check finds, each once; none when the version may be published. */
export async function publishingFaults(
  req: PayloadRequest,
  version: Partial<CourseVersion>,
): Promise<string[]> {
  const faults: string[] = []
  const scaleId = idOf(version.gradingScale)
  const scale = scaleId
    ? await req.payload.findByID({ collection: 'grading-scales', id: scaleId, depth: 0, req })
    : null
  if (!scale) faults.push('The version names no grading scale.')
  const points = scale?.points.length ?? 0
  if (scale && !inScale(version.defaultMinimum, points)) {
    faults.push(`The default minimum is not a point on ${scale.name}.`)
  }

  const placed = (version.modules ?? []).flatMap((module) =>
    (module.lessonPlans ?? []).map((plan) => ({ module: module.title, id: idOf(plan)! })),
  )
  if (placed.length === 0) faults.push('The version has no lesson plans in its modules.')

  const [plans, tasks] = await Promise.all([
    req.payload.find({
      collection: 'lesson-plans',
      where: { id: { in: placed.map((entry) => entry.id) } },
      pagination: false,
      depth: 0,
      req,
    }),
    req.payload.find({
      collection: 'tasks',
      where: { retired: { equals: true } },
      pagination: false,
      depth: 0,
      select: { name: true },
      req,
    }),
  ])
  const retiredTasks = new Map(tasks.docs.map((task) => [task.id, task.name]))
  const scenarioIds = plans.docs.flatMap((plan) => (plan.scenarios ?? []).map(idOf))
  const scenarios = await req.payload.find({
    collection: 'scenarios',
    where: { id: { in: scenarioIds } },
    pagination: false,
    depth: 0,
    req,
  })
  const scenariosById = new Map<string, Scenario>(scenarios.docs.map((s) => [s.id, s]))

  for (const { module, id } of placed) {
    const plan = plans.docs.find((candidate) => candidate.id === id)
    if (!plan) continue
    const name = plan.code || (plan.title ? `“${plan.title}”` : `A lesson plan in ${module}`)

    if (!plan.code) faults.push(`${name} has no code.`)
    if (!plan.title) faults.push(`${name} has no title.`)
    if (plan.minimum == null) faults.push(`${name} has no minimum grade.`)
    else if (scale && !inScale(plan.minimum, points)) {
      faults.push(`${name}’s minimum grade is not a point on ${scale.name}.`)
    }
    if (!plan.theoryItems?.length && !plan.scenarios?.length) {
      faults.push(`${name} has no theory item or scenario.`)
    }
    for (const item of plan.theoryItems ?? []) {
      const retired = retiredTasks.get(idOf(item.task) ?? '')
      if (retired) faults.push(`${name} uses the retired task ${retired}.`)
    }
    for (const offered of plan.scenarios ?? []) {
      const scenario = scenariosById.get(idOf(offered) ?? '')
      if (!scenario) continue
      if (scenario.retired) faults.push(`${name} offers the retired scenario ${scenario.name}.`)
      for (const row of scenario.practicalTasks ?? []) {
        const retired = retiredTasks.get(idOf(row.task) ?? '')
        if (retired) faults.push(`Scenario ${scenario.name} uses the retired task ${retired}.`)
      }
    }
  }

  return [...new Set(faults)]
}
