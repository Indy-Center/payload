import type { PayloadRequest } from 'payload'
import { idOf } from './ids'
import { gradableStatements } from './lesson-plan-tasks'
import { buildTaskTree, loadTaskTree, type TaskTree } from './task-tree'

/**
 * A task as a picker offers it: "2.2.1 Taxi to runway", and which statements it has, which a
 * lesson plan task's grade boxes start ticked for when it is picked.
 */
export type TaskOption = {
  id: string
  number: string
  label: string
  statements: { knowledge: boolean; skill: boolean }
}

export type TaskOptions = {
  /** The tasks a search matches, in tree order. */
  options: TaskOption[]
  /** The task already chosen, labelled whatever the search, or null. */
  selected: TaskOption | null
}

export type TaskOptionsQuery = {
  /** Part of a name, in any case, or a number: "2.2" finds 2.2 and every task beneath it. */
  search?: string
  /** The task already chosen: offered even when retired, as the fields' `filterOptions` allow. */
  current?: string
  /** A task to leave out with every task beneath it: a task's own Parent picker passes itself. */
  exclude?: string
}

const labelOf = (tree: TaskTree, id: string): TaskOption => {
  const task = tree.get(id)
  return {
    id,
    number: tree.number(id),
    label: `${tree.number(id)} ${task?.name ?? ''}`,
    statements: task ? gradableStatements(task) : { knowledge: false, skill: false },
  }
}

/**
 * The options of every task picker: a lesson plan's tasks and a task's parent. A number is never stored (0025), so Payload's own picker, which searches and
 * labels by stored fields, cannot match or show it; this reads the tree and does both. Retired
 * tasks are left out unless already chosen, as the fields' `filterOptions` say.
 */
export async function loadTaskOptions(
  req: PayloadRequest,
  { search = '', current, exclude }: TaskOptionsQuery = {},
): Promise<TaskOptions> {
  const tree = await loadTaskTree(req, { overrideAccess: false })
  const wanted = search.trim().toLowerCase().replace(/\.+$/, '')
  const matches = (id: string, name: string) => {
    if (!wanted) return true
    const number = tree.number(id)
    return (
      number === wanted || number.startsWith(`${wanted}.`) || name.toLowerCase().includes(wanted)
    )
  }

  // A task's parent can be neither the task nor anything beneath it, which would make a loop.
  const excluded = new Set(
    exclude ? [exclude, ...tree.descendants(exclude).map((task) => task.id)] : [],
  )
  const options = tree.inOrder
    .filter((task) => (!task.retired || task.id === current) && !excluded.has(task.id))
    .filter((task) => matches(task.id, task.name))
    .map((task) => labelOf(tree, task.id))
  const selected = current && tree.get(current) ? labelOf(tree, current) : null
  return { options, selected }
}

/**
 * One task's number, for its page title: the tree read with only what numbering needs (each
 * task's parent and sort key), not its mappings and citations. Null for a task that isn't there.
 */
export async function loadTaskNumber(req: PayloadRequest, id: string): Promise<string | null> {
  const { docs } = await req.payload.find({
    collection: 'tasks',
    depth: 0,
    pagination: false,
    overrideAccess: false,
    user: req.user,
    select: { parent: true, _order: true },
    req,
  })
  const tree = buildTaskTree(
    docs.map((task) => ({
      id: task.id,
      name: '',
      description: '',
      knowledgeStatement: '',
      skillStatement: '',
      parentId: idOf(task.parent),
      retired: false,
      order: task._order ?? '',
      competencyIds: [],
      citations: [],
    })),
  )
  return tree.get(id) ? tree.number(id) : null
}

/**
 * `admin.components` for a relationship to tasks: the numbered picker, `TaskPicker`. With
 * `ticksGrades`, as on a lesson plan task, picking a task sets the row's `gradesKnowledge` and
 * `gradesSkill` to the statements it has.
 */
export const taskPickerComponents = ({
  excludeSelf = false,
  ticksGrades = false,
}: { excludeSelf?: boolean; ticksGrades?: boolean } = {}) => ({
  Field: {
    path: '/components/admin/TaskPicker',
    exportName: 'TaskPicker',
    clientProps: { excludeSelf, ticksGrades },
  },
})
