import { APIError, type PayloadRequest } from 'payload'
import { generateKeyBetween } from 'payload/shared'
import type { User } from '@/payload-types'
import { isStaff } from './access'
import { isMoveDirection, type MoveDirection } from './move-direction'
import { loadTaskTree, type TaskTree } from './task-tree'

export const MOVE_STAFF_ONLY = 'Only the Training Admin and lead instructors may move tasks.'
const NO_DIRECTION = 'Move a task up or down.'
const ORDER_NEEDS_REPAIR =
  'The order of these tasks needs repairing; move one of them in the grid once.'

/** A task's siblings in order, itself included, retired ones too: they keep their numbers (0025). */
const siblingsOf = (tree: TaskTree, id: string) => {
  const parentId = tree.get(id)?.parentId ?? null
  return tree.inOrder.filter((task) => (task.parentId ?? null) === parentId)
}

/** Which way a task can move among its siblings: the first has no up, the last no down. */
export function movesOf(tree: TaskTree, id: string): { up: boolean; down: boolean } {
  const siblings = siblingsOf(tree, id)
  const at = siblings.findIndex((task) => task.id === id)
  return { up: at > 0, down: at >= 0 && at < siblings.length - 1 }
}

/**
 * Moves a task one place up or down among its siblings, with everything beneath it, as the person
 * signed in on `req`. Only the moved task's sort key (`_order`) is rewritten: its number, its
 * children's and its siblings' come from the tree (0025). Only the Training Admin and leads move
 * tasks (0022). Answers with what the move renumbered, as "2.2.3 Taxi to ramp is now 2.2.2".
 */
export async function moveTask(
  req: PayloadRequest,
  id: string,
  direction: MoveDirection,
): Promise<{ message: string; from: string; to: string }> {
  if (!isStaff(req.user as Pick<User, 'roles' | 'cid'> | null)) {
    throw new APIError(MOVE_STAFF_ONLY, 403)
  }
  if (!isMoveDirection(direction)) throw new APIError(NO_DIRECTION, 400)

  const tree = await loadTaskTree(req, { overrideAccess: false })
  const task = tree.get(id)
  if (!task) throw new APIError('That task no longer exists.', 404)
  const from = tree.number(id)
  const label = `${from} ${task.name}`

  const siblings = siblingsOf(tree, id)
  const at = siblings.findIndex((each) => each.id === id)
  const keyAt = (index: number) => siblings[index]?.order || null
  // Two siblings with the same key, or none, leave no key between them; `generateKeyBetween` then
  // throws a plain Error. Saving the siblings' order in the grid gives each its own key again.
  const keyBetween = (before: string | null, after: string | null) => {
    try {
      return generateKeyBetween(before, after)
    } catch {
      throw new APIError(ORDER_NEEDS_REPAIR, 400)
    }
  }
  let key: string
  if (direction === 'up') {
    if (at === 0) throw new APIError(`${label} is already first.`, 400)
    key = keyBetween(keyAt(at - 2), keyAt(at - 1))
  } else {
    if (at === siblings.length - 1) throw new APIError(`${label} is already last.`, 400)
    key = keyBetween(keyAt(at + 1), keyAt(at + 2))
  }

  await req.payload.update({
    collection: 'tasks',
    id,
    data: { _order: key },
    depth: 0,
    overrideAccess: false,
    user: req.user,
    req,
  })

  const to = (await loadTaskTree(req, { overrideAccess: false })).number(id)
  return { message: `${label} is now ${to}`, from, to }
}
