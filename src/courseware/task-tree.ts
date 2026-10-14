import type { PayloadRequest } from 'payload'
import { idOf } from './ids'

export type TreeTask = {
  id: string
  name: string
  description: string
  parentId: string | null
  retired: boolean
  /** The orderable collection's fractional key: siblings sort by it. */
  order: string
}

/**
 * The one task tree, with the facts nothing stores: each task's number and its place among its
 * siblings. A task's number is never saved (decision 0025); it is worked out here every time.
 */
export type TaskTree = {
  /** Every task, each after its parent, siblings in order. */
  inOrder: TreeTask[]
  get(id: string): TreeTask | undefined
  /** "2.3.1": positions among siblings, from the root down. Retired tasks keep their place. */
  number(id: string): string
  /** Every task beneath this one, in tree order. */
  descendants(id: string): TreeTask[]
  /** From the root down to this task's parent. */
  ancestors(id: string): TreeTask[]
}

export function buildTaskTree(tasks: readonly TreeTask[]): TaskTree {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const children = new Map<string | null, TreeTask[]>()
  for (const task of tasks) {
    // A parent that no longer resolves makes the task a root rather than losing it.
    const parent = task.parentId && byId.has(task.parentId) ? task.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), task])
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
  }

  const numbers = new Map<string, string>()
  const inOrder: TreeTask[] = []
  const visit = (parentId: string | null, prefix: string, seen: Set<string>) => {
    for (const [index, task] of (children.get(parentId) ?? []).entries()) {
      if (seen.has(task.id)) continue // a loop in the parents; stop rather than recurse forever
      const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`
      numbers.set(task.id, number)
      inOrder.push(task)
      visit(task.id, number, new Set([...seen, task.id]))
    }
  }
  visit(null, '', new Set())

  const descendants = (id: string): TreeTask[] =>
    (children.get(id) ?? []).flatMap((child) => [child, ...descendants(child.id)])

  return {
    inOrder,
    get: (id) => byId.get(id),
    number: (id) => numbers.get(id) ?? '',
    descendants,
    ancestors(id) {
      const chain: TreeTask[] = []
      let parentId = byId.get(id)?.parentId ?? null
      while (parentId && !chain.some((task) => task.id === parentId)) {
        const parent = byId.get(parentId)
        if (!parent) break
        chain.unshift(parent)
        parentId = parent.parentId
      }
      return chain
    },
  }
}

/** Reads the whole tree. It is small (hundreds of tasks), so it is always read whole. */
export async function loadTaskTree(req: PayloadRequest): Promise<TaskTree> {
  const { docs } = await req.payload.find({
    collection: 'tasks',
    depth: 0,
    pagination: false,
    req,
  })
  return buildTaskTree(
    docs.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description ?? '',
      parentId: idOf(task.parent),
      retired: task.retired ?? false,
      order: task._order ?? '',
    })),
  )
}
