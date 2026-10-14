import type { PayloadRequest } from 'payload'
import type { Catalogue, CatalogueTask } from './document'
import { idOf } from './ids'
import { loadTaskTree, type TaskTree } from './task-tree'

/** The task tree, frameworks, competencies and references, for task and competency pages. */
export async function buildCatalogue(req: PayloadRequest): Promise<Catalogue> {
  const { payload } = req
  const [tree, frameworks, competencies, references] = await Promise.all([
    loadTaskTree(req),
    payload.find({ collection: 'frameworks', sort: 'name', pagination: false, depth: 0, req }),
    payload.find({ collection: 'competencies', pagination: false, depth: 0, req }),
    payload.find({ collection: 'references', sort: 'name', pagination: false, depth: 1, req }),
  ])

  return {
    frameworks: frameworks.docs.map((framework) => ({
      id: framework.id,
      name: framework.name,
      edition: framework.edition,
    })),
    competencies: competencies.docs
      .map((competency) => ({
        id: competency.id,
        frameworkId: idOf(competency.framework)!,
        sourceId: competency.sourceId,
        title: competency.title,
        text: competency.text ?? '',
        parentId: idOf(competency.parent),
        sourceReference: competency.sourceReference ?? '',
        rubricTheory: competency.rubricTheory ?? '',
        rubricPractical: competency.rubricPractical ?? '',
        pairedGcapCode: competency.pairedGcapCode ?? '',
      }))
      .sort((a, b) => compareSourceIds(a.sourceId, b.sourceId)),
    references: references.docs.map((reference) => ({
      id: reference.id,
      name: reference.name,
      edition: reference.edition ?? '',
      url:
        reference.url ||
        (typeof reference.document === 'object' ? (reference.document?.url ?? null) : null),
    })),
    tasks: tree.inOrder.map((task) => catalogueTask(tree, task.id)),
  }
}

function catalogueTask(tree: TaskTree, id: string): CatalogueTask {
  const task = tree.get(id)!
  // Its own mappings first, then each ancestor's from the nearest up (decision 0012).
  const mappings = [task, ...tree.ancestors(id).reverse()].flatMap((from) =>
    from.competencyIds.map((competencyId) => ({ competencyId, fromTaskId: from.id })),
  )
  return {
    id,
    number: tree.number(id),
    name: task.name,
    description: task.description,
    parentId: task.parentId,
    retired: task.retired,
    mappings,
    citations: task.citations,
  }
}

/** Orders "2.1.10" after "2.1.9", and "2.1.3a" after "2.1.3". */
function compareSourceIds(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}
