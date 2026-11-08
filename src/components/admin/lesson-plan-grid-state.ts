import type { GridPlanTask, LessonPlanGridBatch, PickerTask } from '@/courseware/lesson-plan-grid'

/**
 * A lesson plan's "Edit as grid" tab: its pending changes over the saved rows, and the batch Save
 * sends. Nothing here is written until Save.
 */

/** The cells a row edits. */
export type RowField = 'required' | 'gradesKnowledge' | 'gradesSkill' | 'teacherNotes'

export type GridRow = Omit<GridPlanTask, 'id'> & {
  /** The saved row's id, or `new:<n>` for a row added here. */
  key: string
  isNew: boolean
  /** A saved row Remove has marked: it stays shown, struck through, until Save or Keep. */
  removed: boolean
}

export type GridState = {
  saved: readonly GridPlanTask[]
  rows: GridRow[]
  /** The next new row's key. */
  next: number
}

export type GridAction =
  | { type: 'set'; key: string; field: Exclude<RowField, 'teacherNotes'>; value: boolean }
  | { type: 'notes'; key: string; value: string }
  | { type: 'move'; key: string; by: -1 | 1 }
  | { type: 'remove'; key: string }
  | { type: 'add'; tasks: readonly PickerTask[] }
  | { type: 'reset'; saved: readonly GridPlanTask[] }

const fromSaved = ({ id, ...row }: GridPlanTask): GridRow => ({
  ...row,
  key: id,
  isNew: false,
  removed: false,
})

export function initGrid(saved: readonly GridPlanTask[]): GridState {
  return { saved, rows: saved.map(fromSaved), next: 1 }
}

const change = (state: GridState, key: string, patch: Partial<GridRow>): GridState => ({
  ...state,
  rows: state.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
})

export function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case 'set':
      return change(state, action.key, { [action.field]: action.value })
    case 'notes':
      return change(state, action.key, { teacherNotes: action.value })
    case 'move': {
      const rows = [...state.rows]
      const from = rows.findIndex((row) => row.key === action.key)
      const to = from + action.by
      if (from < 0 || to < 0 || to >= rows.length) return state
      ;[rows[from], rows[to]] = [rows[to], rows[from]]
      return { ...state, rows }
    }
    case 'remove': {
      const row = state.rows.find((each) => each.key === action.key)
      if (!row) return state
      if (row.isNew) return { ...state, rows: state.rows.filter((each) => each !== row) }
      return change(state, action.key, { removed: !row.removed })
    }
    case 'add': {
      // Added rows start as a lesson plan task does (0065): required, and graded on each
      // statement their task has.
      const added = action.tasks.map((task, index): GridRow => ({
        key: `new:${state.next + index}`,
        isNew: true,
        removed: false,
        task: task.id,
        number: task.number,
        name: task.name,
        retired: false,
        hasKnowledge: task.hasKnowledge,
        hasSkill: task.hasSkill,
        required: true,
        gradesKnowledge: task.hasKnowledge,
        gradesSkill: task.hasSkill,
        teacherNotes: '',
      }))
      return { ...state, rows: [...state.rows, ...added], next: state.next + added.length }
    }
    case 'reset':
      return initGrid(action.saved)
  }
}

/** The tasks the lesson plan holds, a row marked for removal included: the picker's "already added". */
export const presentTasks = (state: GridState) => new Set(state.rows.map((row) => row.task))

/** Which cells of a saved row differ from what was saved. */
export function changedCells(state: GridState, row: GridRow): Set<RowField> {
  const saved = state.saved.find((each) => each.id === row.key)
  const changed = new Set<RowField>()
  if (!saved) return changed
  for (const field of ['required', 'gradesKnowledge', 'gradesSkill', 'teacherNotes'] as const) {
    if (row[field] !== saved[field]) changed.add(field)
  }
  return changed
}

/** The saved rows kept, whose place among the other kept saved rows has changed. */
export function movedRows(state: GridState): Set<string> {
  const kept = (keys: string[]) =>
    keys.filter((key) => state.rows.some((row) => row.key === key && !row.removed))
  const before = kept(state.saved.map((row) => row.id))
  const now = kept(state.rows.filter((row) => !row.isNew).map((row) => row.key))
  return new Set(now.filter((key, index) => before[index] !== key))
}

/** How many changes Save would write: each edited cell, added, removed and moved row. */
export function pendingCount(state: GridState): number {
  const moved = movedRows(state).size
  return state.rows.reduce((sum, row) => {
    if (row.isNew || row.removed) return sum + 1
    return sum + changedCells(state, row).size
  }, moved)
}

/** The batch Save sends: every row kept, in its order. */
export function gridBatch(state: GridState): LessonPlanGridBatch {
  return {
    rows: state.rows
      .filter((row) => !row.removed)
      .map((row) => ({
        key: row.key,
        ...(row.isNew ? {} : { id: row.key }),
        task: row.task,
        required: row.required,
        gradesKnowledge: row.gradesKnowledge,
        gradesSkill: row.gradesSkill,
        teacherNotes: row.teacherNotes,
      })),
  }
}
