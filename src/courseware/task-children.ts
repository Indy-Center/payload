import type { PayloadRequest } from 'payload'
import { loadTaskTree } from './task-tree'

/** One direct child, as the grid on its parent's page shows it. */
export type TaskChild = {
  id: string
  /** Worked out from the tree (decision 0025). */
  number: string
  name: string
  description: string
  /** Tasks beneath this child that are not retired; 0 when it has none. */
  beneath: number
}

export type TaskChildren = {
  /** The direct children that are not retired, in tree order. */
  children: TaskChild[]
  /** The retired direct children, so the gaps in the numbers can be explained. */
  retired: { number: string; name: string }[]
  /** The number a task added beneath this one would get: after every child, retired ones too. */
  nextNumber: string
}

/**
 * What a task's page shows beneath it: its direct children as the person signed in on `req` may
 * read them. A task that is not there has none.
 */
export async function loadTaskChildren(req: PayloadRequest, id: string): Promise<TaskChildren> {
  const tree = await loadTaskTree(req, { overrideAccess: false })
  const parent = tree.get(id)
  if (!parent) return { children: [], retired: [], nextNumber: '' }

  const direct = tree.inOrder.filter((task) => task.parentId === id)
  return {
    children: direct
      .filter((task) => !task.retired)
      .map((task) => ({
        id: task.id,
        number: tree.number(task.id),
        name: task.name,
        description: task.description,
        beneath: tree.descendants(task.id).filter((each) => !each.retired).length,
      })),
    retired: direct
      .filter((task) => task.retired)
      .map((task) => ({ number: tree.number(task.id), name: task.name })),
    nextNumber: `${tree.number(id)}.${direct.length + 1}`,
  }
}
