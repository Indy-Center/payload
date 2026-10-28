import type { PayloadRequest } from 'payload'
import { loadTaskTree, type TreeTask } from './task-tree'

/** One task as the Tasks list shows it. */
export type TaskTreeRow = {
  id: string
  /** Worked out from the tree (decision 0025): a hidden retired task keeps its number. */
  number: string
  name: string
  description: string
  retired: boolean
  parentId: string | null
  /** 0 for a top-level task. */
  depth: number
  /** Whether any of its children are in `rows`, so it has something to open. */
  hasChildren: boolean
}

export type TaskTreeListOptions = {
  /** Part of a name, in any case. Matches are shown under their parents. */
  search?: string
  /** Retired tasks, and the tasks beneath them, are left out unless this is set. */
  showRetired?: boolean
}

export type TaskTreeList = {
  /** The tasks to show, each after its parent, siblings in order. */
  rows: TaskTreeRow[]
  /** The tasks a search opened: every parent above a match. Empty without a search. */
  opened: string[]
}

/**
 * The Tasks list: the one task tree, numbered, as the person signed in on `req` may read it. A
 * list shows a row once every task above it is open.
 */
export async function loadTaskTreeList(
  req: PayloadRequest,
  { search = '', showRetired = false }: TaskTreeListOptions = {},
): Promise<TaskTreeList> {
  const tree = await loadTaskTree(req, { overrideAccess: false })

  // A retired task takes the tasks beneath it out of the list with it.
  const listed = (task: TreeTask) =>
    showRetired || ![...tree.ancestors(task.id), task].some((each) => each.retired)
  let tasks = tree.inOrder.filter(listed)

  const wanted = search.trim().toLowerCase()
  const opened = new Set<string>()
  if (wanted) {
    const shown = new Set<string>()
    for (const task of tasks) {
      if (!task.name.toLowerCase().includes(wanted)) continue
      shown.add(task.id)
      for (const parent of tree.ancestors(task.id)) {
        shown.add(parent.id)
        opened.add(parent.id)
      }
    }
    tasks = tasks.filter((task) => shown.has(task.id))
  }

  const shownIds = new Set(tasks.map((task) => task.id))
  const parentsShown = new Set(tasks.map((task) => task.parentId))
  return {
    rows: tasks.map((task) => {
      const parentId = task.parentId && shownIds.has(task.parentId) ? task.parentId : null
      return {
        id: task.id,
        number: tree.number(task.id),
        name: task.name,
        description: task.description,
        retired: task.retired,
        parentId,
        depth: tree.ancestors(task.id).length,
        hasChildren: parentsShown.has(task.id),
      }
    }),
    opened: [...opened],
  }
}
