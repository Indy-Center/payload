/**
 * A lesson plan's "Edit as grid" tab: its shapes, and the rules of its "Add tasks" picker, which
 * its browser side and its tests share. Nothing here reaches the database, so the admin imports it.
 */

/** A saved lesson plan task, as the grid starts from it. */
export type GridPlanTask = {
  /** The row's own id. */
  id: string
  task: string
  /** The task's number in the tree today, and its name. */
  number: string
  name: string
  retired: boolean
  /** The task's own statements (0066), shown on the row as they read today; empty when unset. */
  knowledgeStatement: string
  skillStatement: string
  required: boolean
  teacherNotes: string
}

/** A live task the picker offers, in tree order. */
export type PickerTask = {
  id: string
  parentId: string | null
  number: string
  name: string
  depth: number
  knowledgeStatement: string
  skillStatement: string
}

/** One row as Save sends it: a saved row keeps its `id`; `key` names the row in a refusal. */
export type LessonPlanGridRow = {
  key: string
  id?: string
  task: string
  required: boolean
  teacherNotes: string
}

/**
 * Every row of the lesson plan in its new order, saved together or not at all, from the lesson
 * plan's `updatedAt` as the grid loaded it (or as its last Save answered).
 */
export type LessonPlanGridBatch = { updatedAt?: string; rows: LessonPlanGridRow[] }

/** A Save from a grid opened before the lesson plan's last save (decision 0068). */
export const STALE_LESSON_PLAN =
  'Someone else saved this lesson plan since the grid was opened. Reload it and make your changes again.'

/** Every picker task beneath `id`, in tree order. */
function beneath(tasks: readonly PickerTask[], id: string): PickerTask[] {
  const under = new Set([id])
  const found: PickerTask[] = []
  for (const task of tasks) {
    if (task.parentId && under.has(task.parentId)) {
      under.add(task.id)
      found.push(task)
    }
  }
  return found
}

/**
 * Ticks or unticks one task in the picker. Ticking a task ticks every task beneath it too, other
 * than those already on the lesson plan; unticking one leaves the rest as they are.
 */
export function toggleTicked(
  tasks: readonly PickerTask[],
  ticked: ReadonlySet<string>,
  present: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(ticked)
  if (next.has(id)) {
    next.delete(id)
    return next
  }
  if (present.has(id)) return next
  next.add(id)
  for (const task of beneath(tasks, id)) if (!present.has(task.id)) next.add(task.id)
  return next
}

/**
 * What "Add" appends, one per ticked task, in tree order, leaving out any already on the lesson
 * plan and any the picker doesn't offer (retired ones).
 */
export function tasksToAdd(
  tasks: readonly PickerTask[],
  ticked: ReadonlySet<string>,
  present: ReadonlySet<string>,
): PickerTask[] {
  return tasks.filter((task) => ticked.has(task.id) && !present.has(task.id))
}
