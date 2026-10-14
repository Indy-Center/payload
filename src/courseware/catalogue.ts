import type { PayloadRequest } from 'payload'
import type { Catalogue } from './document'
import { loadTaskTree } from './task-tree'

/** The task tree, frameworks, competencies and references, for task and competency pages. */
export async function buildCatalogue(req: PayloadRequest): Promise<Catalogue> {
  const tree = await loadTaskTree(req)
  return {
    frameworks: [],
    competencies: [],
    references: [],
    tasks: tree.inOrder.map((task) => ({
      id: task.id,
      number: tree.number(task.id),
      name: task.name,
      description: task.description,
      parentId: task.parentId,
      retired: task.retired,
      mappings: [],
      citations: [],
    })),
  }
}
