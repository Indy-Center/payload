import { ValidationError, type FilterOptions, type PayloadRequest } from 'payload'
import { idOf } from './ids'
import { loadTaskTree } from './task-tree'

/** A row in a lesson plan's theory items or a scenario's practical tasks. */
type TaskRow = { id?: string | null; task?: string | { id: string } | null }

/**
 * Pickers offer tasks that are not retired. A row that already holds a retired task keeps it, so
 * retiring a task never stops an older lesson plan from saving.
 */
export const pickableTask: FilterOptions = ({ siblingData }) => {
  const current = idOf((siblingData as TaskRow | undefined)?.task)
  const live = { retired: { not_equals: true } }
  return current ? { or: [live, { id: { equals: current } }] } : live
}

/**
 * The rule both builders share (decision 0013): a row the author has just added for a parent task
 * is followed by a row for every task beneath it, in tree order. It happens in this save only;
 * what is saved is the list of specific tasks, so a task added to the tree later changes nothing,
 * and the author is free to remove or reorder the rows afterwards.
 *
 * Also refuses a retired task in a row that is new or newly pointed at it.
 */
export async function expandTaskRows<Row extends TaskRow>(
  req: PayloadRequest,
  rows: Row[] | null | undefined,
  previous: TaskRow[] | null | undefined,
  path: string,
  blank: Omit<Row, 'id' | 'task'>,
): Promise<Row[] | null | undefined> {
  if (!rows?.length) return rows

  const before = new Map((previous ?? []).map((row) => [row.id, idOf(row.task)]))
  const isNew = (row: Row) => !row.id || before.get(row.id) !== idOf(row.task)
  if (!rows.some(isNew)) return rows

  const tree = await loadTaskTree(req)
  const retired = rows.flatMap((row, index) =>
    isNew(row) && tree.get(idOf(row.task) ?? '')?.retired
      ? [{ path: `${path}.${index}.task`, message: 'This task is retired.' }]
      : [],
  )
  if (retired.length > 0) throw new ValidationError({ errors: retired })

  const present = new Set(rows.map((row) => idOf(row.task)))
  const expanded: Row[] = []
  for (const row of rows) {
    expanded.push(row)
    const taskId = idOf(row.task)
    if (!taskId || !isNew(row)) continue
    for (const child of tree.descendants(taskId)) {
      if (child.retired || present.has(child.id)) continue
      present.add(child.id)
      expanded.push({ ...blank, task: child.id } as Row)
    }
  }
  return expanded
}
