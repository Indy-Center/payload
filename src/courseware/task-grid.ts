import { generateKeyBetween, generateNKeysBetween } from 'payload/shared'

/**
 * The Tasks grid's shapes and the one rule its browser side and its save share: which sort keys a
 * new sibling order rewrites. Nothing here reaches the database, so the admin's grid imports it too.
 */

/** A saved task as the grid starts from it. */
export type GridTask = {
  id: string
  name: string
  description: string
  /** Null for a top-level task. */
  parentId: string | null
  retired: boolean
  /** The orderable collection's fractional key (`_order`): siblings sort by it. */
  order: string
}

/**
 * Every pending change in the grid, saved together or not at all. A new task is named by a `key`
 * of the grid's own until it has an id; a parent may be a saved task's id or a new task's key.
 */
export type TaskGridBatch = {
  /** Saved tasks' new name or description, or their retiring or un-retiring. */
  changes?: { id: string; name?: string; description?: string; retired?: boolean }[]
  adds?: { key: string; parent: string | null; name: string; description?: string }[]
  /**
   * For each group of siblings whose order changed or that gained a task: every task in it, saved
   * and new, retired ones too, in its new order. A task stays under its parent; moving between
   * levels is done on the task's own page.
   */
  orders?: { parent: string | null; tasks: string[] }[]
}

/** A refused row: the task's id or new key, and why. A refusal of the whole batch has no row. */
export type TaskGridRefusal = { row?: string; message: string }

/**
 * The siblings whose sort keys a new order leaves alone: the longest run, in the new order, whose
 * keys already rise. Every other sibling, and every new one (no key), is given a new key.
 */
function keptKeys(siblings: readonly { id: string; key: string | null }[]): Set<string> {
  const keyed = siblings.filter((each): each is { id: string; key: string } => Boolean(each.key))
  // Longest strictly rising run of keys; the groups are small, so the plain quadratic search.
  const length = keyed.map(() => 1)
  const previous = keyed.map(() => -1)
  for (let i = 0; i < keyed.length; i++) {
    for (let j = 0; j < i; j++) {
      if (keyed[j].key < keyed[i].key && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1
        previous[i] = j
      }
    }
  }
  const kept = new Set<string>()
  let at = length.indexOf(Math.max(0, ...length))
  while (at !== -1) {
    kept.add(keyed[at].id)
    at = previous[at]
  }
  return kept
}

/**
 * The new sort keys a group of siblings needs to stand in the order given: one for each new task,
 * and one for each saved task whose key no longer fits, so a move rewrites the moved task only.
 */
export function siblingKeys(siblings: readonly { id: string; key: string | null }[]) {
  const kept = keptKeys(siblings)
  const keys = new Map<string, string>()
  let index = 0
  while (index < siblings.length) {
    if (kept.has(siblings[index].id)) {
      index++
      continue
    }
    // A run of siblings to key, between the kept keys either side of it.
    const start = index
    while (index < siblings.length && !kept.has(siblings[index].id)) index++
    const before = start > 0 ? siblings[start - 1].key : null
    const after = index < siblings.length ? siblings[index].key : null
    const run = siblings.slice(start, index)
    const fresh =
      run.length === 1
        ? [generateKeyBetween(before, after)]
        : generateNKeysBetween(before, after, run.length)
    run.forEach((each, at) => keys.set(each.id, fresh[at]))
  }
  return keys
}

/** The saved tasks a new order moves: those `siblingKeys` gives a new key. */
export function movedBy(siblings: readonly { id: string; key: string | null }[]): string[] {
  const kept = keptKeys(siblings)
  return siblings.filter((each) => each.key && !kept.has(each.id)).map((each) => each.id)
}
