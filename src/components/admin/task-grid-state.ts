import {
  movedBy,
  PARENT_RETIRED,
  PARENT_RETIRING,
  type GridTask,
  type TaskGridBatch,
} from '@/courseware/task-grid'

/**
 * The Tasks grid's pending changes over the saved tasks, and what it shows from them: each row's
 * number, worked out from the grid's own copy of the tree so it changes as soon as a task is
 * added or moved (0025), and the batch Save sends. Nothing here is written until Save.
 */

/** A task added in the grid and not yet saved, named by a key of the grid's own. */
export type NewTask = { key: string; parentId: string | null; name: string; description: string }

export type GridState = {
  saved: readonly GridTask[]
  added: NewTask[]
  /** Saved tasks' edited cells; a cell edited back to its saved text is dropped. */
  edits: Record<string, { name?: string; description?: string }>
  /** Saved tasks to retire (true) or un-retire (false). */
  retire: Record<string, boolean>
  /** Each parent's children, saved and new, in their order. The top level is under ''. */
  order: Record<string, string[]>
  /** The saved order, to tell which groups changed. */
  savedOrder: Record<string, string[]>
  /** The next new task's key. */
  next: number
  /** The new row whose name cell takes the cursor. */
  focus: string | null
}

export type GridAction =
  | { type: 'edit'; id: string; field: 'name' | 'description'; value: string }
  | { type: 'swap'; id: string; with: string }
  | { type: 'add'; parent: string | null; after?: string }
  | { type: 'remove'; key: string }
  | { type: 'retire'; id: string }
  | { type: 'focused' }
  | { type: 'reset'; tasks: readonly GridTask[] }

const at = (parent: string | null) => parent ?? ''

export function initGrid(saved: readonly GridTask[]): GridState {
  // The tasks come in tree order, so each parent's children arrive in their order.
  const order: Record<string, string[]> = {}
  for (const task of saved) (order[at(task.parentId)] ??= []).push(task.id)
  return {
    saved,
    added: [],
    edits: {},
    retire: {},
    order,
    savedOrder: order,
    next: 1,
    focus: null,
  }
}

export function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case 'edit': {
      const { id, field, value } = action
      if (state.added.some((task) => task.key === id)) {
        return {
          ...state,
          added: state.added.map((task) => (task.key === id ? { ...task, [field]: value } : task)),
        }
      }
      const saved = state.saved.find((task) => task.id === id)
      if (!saved) return state
      const cells = { ...state.edits[id] }
      if (value === saved[field]) delete cells[field]
      else cells[field] = value
      const edits = { ...state.edits, [id]: cells }
      if (!Object.keys(cells).length) delete edits[id]
      return { ...state, edits }
    }
    case 'swap': {
      const parent = parentOf(state, action.id)
      const siblings = [...(state.order[at(parent)] ?? [])]
      const a = siblings.indexOf(action.id)
      const b = siblings.indexOf(action.with)
      if (a < 0 || b < 0) return state
      ;[siblings[a], siblings[b]] = [siblings[b], siblings[a]]
      return { ...state, order: { ...state.order, [at(parent)]: siblings } }
    }
    case 'add': {
      const key = `new:${state.next}`
      const siblings = [...(state.order[at(action.parent)] ?? [])]
      const after = action.after ? siblings.indexOf(action.after) : -1
      if (after >= 0) siblings.splice(after + 1, 0, key)
      else siblings.push(key)
      return {
        ...state,
        added: [...state.added, { key, parentId: action.parent, name: '', description: '' }],
        order: { ...state.order, [at(action.parent)]: siblings },
        next: state.next + 1,
        focus: key,
      }
    }
    case 'remove': {
      // A new task's children are new too, and go with it.
      const gone = new Set<string>()
      const take = (key: string) => {
        gone.add(key)
        for (const child of state.order[key] ?? []) take(child)
      }
      take(action.key)
      const order = Object.fromEntries(
        Object.entries(state.order)
          .filter(([parent]) => !gone.has(parent))
          .map(([parent, children]) => [parent, children.filter((id) => !gone.has(id))]),
      )
      return { ...state, added: state.added.filter((task) => !gone.has(task.key)), order }
    }
    case 'retire': {
      const saved = state.saved.find((task) => task.id === action.id)
      if (!saved) return state
      const retire = { ...state.retire }
      if (action.id in retire) delete retire[action.id]
      else retire[action.id] = !saved.retired
      return { ...state, retire }
    }
    case 'focused':
      return { ...state, focus: null }
    case 'reset':
      return initGrid(action.tasks)
  }
}

function parentOf(state: GridState, id: string): string | null {
  return (
    state.saved.find((task) => task.id === id)?.parentId ??
    state.added.find((task) => task.key === id)?.parentId ??
    null
  )
}

const sameList = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((id, index) => b[index] === id)

/** The groups of siblings whose order differs from the saved one, new tasks included. */
function changedGroups(state: GridState): string[] {
  return Object.keys(state.order).filter(
    (parent) => !sameList(state.order[parent], state.savedOrder[parent]),
  )
}

/** The saved tasks a move gives a new place among their siblings. */
function moved(state: GridState): Set<string> {
  const byId = new Map(state.saved.map((task) => [task.id, task]))
  return new Set(
    changedGroups(state).flatMap((parent) =>
      movedBy(state.order[parent].map((id) => ({ id, key: byId.get(id)?.order || null }))),
    ),
  )
}

export type GridRow =
  | {
      kind: 'task'
      id: string
      parent: string | null
      number: string
      depth: number
      name: string
      description: string
      isNew: boolean
      /** Saved as retired. */
      retired: boolean
      /** Pending: true to retire it, false to un-retire it. */
      retire?: boolean
      changed: { name: boolean; description: boolean; place: boolean }
      /** The visible siblings either side, for ↑ and ↓. */
      up: string | null
      down: string | null
      /** Whether it may be given a first child here: it has none showing and isn't retired. */
      canAddChild: boolean
      /**
       * Why the row can't be changed or added beside: its parent is retired, and the Tasks
       * collection refuses any save under a retired parent.
       */
      locked: string | null
      /** Why a new row would be refused as it stands: its parent is being retired. */
      warning: string | null
    }
  | { kind: 'placeholder'; parent: string | null; number: string; depth: number }

/**
 * The grid's rows in tree order. A retired task keeps its number, so hiding it (and the tasks
 * beneath it) leaves a gap. Every group of siblings shown ends in a placeholder numbered where
 * the next task would land; a task with none showing offers "+ Child" instead.
 */
export function gridRows(state: GridState, showRetired: boolean): GridRow[] {
  const saved = new Map(state.saved.map((task) => [task.id, task]))
  const added = new Map(state.added.map((task) => [task.key, task]))
  const movedIds = moved(state)
  const rows: GridRow[] = []

  const isRetired = (id: string) => {
    const task = saved.get(id)
    return Boolean(task && (state.retire[id] ?? task.retired))
  }
  const hidden = (id: string) =>
    !showRetired && Boolean(saved.get(id)?.retired) && state.retire[id] !== false

  const walk = (parent: string | null, prefix: string, depth: number): boolean => {
    const children = state.order[at(parent)] ?? []
    const shown = children.filter((id) => !hidden(id))
    // Retired and staying so: a pending retire still lets its children be saved first.
    const parentRetired =
      parent !== null && Boolean(saved.get(parent)?.retired) && state.retire[parent] !== false
    for (const [index, id] of children.entries()) {
      if (hidden(id)) continue
      const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`
      const task = saved.get(id)
      const fresh = added.get(id)
      const edits = state.edits[id] ?? {}
      const place = shown.indexOf(id)
      const row: Extract<GridRow, { kind: 'task' }> = {
        kind: 'task',
        id,
        parent,
        number,
        depth,
        name: fresh?.name ?? edits.name ?? task?.name ?? '',
        description: fresh?.description ?? edits.description ?? task?.description ?? '',
        isNew: Boolean(fresh),
        retired: Boolean(task?.retired),
        retire: state.retire[id],
        changed: {
          name: edits.name !== undefined,
          description: edits.description !== undefined,
          place: movedIds.has(id),
        },
        up: shown[place - 1] ?? null,
        down: shown[place + 1] ?? null,
        canAddChild: false,
        locked: parentRetired ? PARENT_RETIRED : null,
        warning: fresh && parent !== null && state.retire[parent] === true ? PARENT_RETIRING : null,
      }
      rows.push(row)
      const hasChildren = walk(id, number, depth + 1)
      row.canAddChild = !hasChildren && !isRetired(id)
    }
    // No new tasks under a retired one: they would be hidden with it.
    const open = parent === null || (shown.length > 0 && !isRetired(parent))
    if (open) {
      rows.push({
        kind: 'placeholder',
        parent,
        number: prefix ? `${prefix}.${children.length + 1}` : `${children.length + 1}`,
        depth,
      })
    }
    return shown.length > 0
  }
  walk(null, '', 0)
  return rows
}

/** How many changes Save would write: each edited cell, new task, moved task and (un-)retire. */
export function pendingCount(state: GridState): number {
  const cells = Object.values(state.edits).reduce((sum, each) => sum + Object.keys(each).length, 0)
  return cells + state.added.length + moved(state).size + Object.keys(state.retire).length
}

/** The batch Save sends. Names are trimmed: a name of spaces is no name. */
export function gridBatch(state: GridState): TaskGridBatch {
  const ids = new Set([...Object.keys(state.edits), ...Object.keys(state.retire)])
  return {
    changes: [...ids].map((id) => ({
      id,
      ...(state.edits[id]?.name !== undefined ? { name: state.edits[id].name!.trim() } : {}),
      ...(state.edits[id]?.description !== undefined
        ? { description: state.edits[id].description }
        : {}),
      ...(id in state.retire ? { retired: state.retire[id] } : {}),
    })),
    adds: state.added.map((task) => ({
      key: task.key,
      parent: task.parentId,
      name: task.name.trim(),
      description: task.description,
    })),
    orders: changedGroups(state).map((parent) => ({
      parent: parent || null,
      tasks: state.order[parent],
    })),
  }
}
