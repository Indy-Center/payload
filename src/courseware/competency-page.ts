import type { PayloadRequest } from 'payload'
import { compareSheetOrder } from './competency-tree'
import { idOf } from './ids'
import { loadTaskTree } from './task-tree'

/** One competency directly beneath the one being shown. */
export type ChildRow = {
  id: string
  sourceId: string
  title: string
  /** Empty for a heading. */
  text: string
  /** How many competencies sit directly under this one. */
  beneath: number
}

/** A task that teaches the competency, named by the number it has today (decision 0025). */
export type TaughtByRow = { id: string; number: string; name: string }

export type CompetencyPage = {
  children: ChildRow[]
  taughtBy: TaughtByRow[]
}

/**
 * What a competency's page lists besides its own fields: the competencies directly beneath it in
 * the sheet's order, and the live tasks mapped to it in task-tree order. Read as the signed-in
 * person, through the collections' own access rules.
 */
export async function loadCompetencyPage(req: PayloadRequest, id: string): Promise<CompetencyPage> {
  const { payload } = req
  const competency = await payload.findByID({
    collection: 'competencies',
    id,
    depth: 0,
    overrideAccess: false,
    req,
  })

  const { docs } = await payload.find({
    collection: 'competencies',
    where: { framework: { equals: idOf(competency.framework) } },
    select: { sourceId: true, title: true, text: true, parent: true },
    pagination: false,
    depth: 0,
    overrideAccess: false,
    req,
  })
  const beneath = new Map<string, number>()
  for (const doc of docs) {
    const parent = idOf(doc.parent)
    if (parent) beneath.set(parent, (beneath.get(parent) ?? 0) + 1)
  }
  const children = docs
    .filter((doc) => idOf(doc.parent) === id)
    .sort((a, b) => compareSheetOrder(a.sourceId, b.sourceId))
    .map((doc) => ({
      id: doc.id,
      sourceId: doc.sourceId,
      title: doc.title,
      text: doc.text ?? '',
      beneath: beneath.get(doc.id) ?? 0,
    }))

  const tasks = await loadTaskTree(req, { overrideAccess: false })
  const taughtBy = tasks.inOrder
    .filter((task) => !task.retired && task.competencyIds.includes(id))
    .map((task) => ({ id: task.id, number: tasks.number(task.id), name: task.name }))

  return { children, taughtBy }
}
