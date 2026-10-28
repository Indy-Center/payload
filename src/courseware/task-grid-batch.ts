import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  ValidationError,
  type PayloadRequest,
} from 'payload'
import type { User } from '@/payload-types'
import { isStaff } from './access'
import { siblingKeys, type GridTask, type TaskGridBatch, type TaskGridRefusal } from './task-grid'
import { loadTaskTree } from './task-tree'

/**
 * The Tasks grid's server side (decision 0022): the tasks it starts from, and its save, which
 * writes every pending change as the signed-in person through the Tasks collection's own rules,
 * in one transaction, all or nothing.
 */

/** Every task, retired ones too, in tree order, as the person signed in on `req` reads them. */
export async function loadGridTasks(req: PayloadRequest): Promise<GridTask[]> {
  const tree = await loadTaskTree(req, { overrideAccess: false })
  return tree.inOrder.map((task) => ({
    id: task.id,
    name: task.name,
    description: task.description,
    // A parent that no longer resolves is shown, and saved, as a top-level task.
    parentId: task.parentId && tree.get(task.parentId) ? task.parentId : null,
    retired: task.retired,
    order: task.order,
  }))
}

/** The batch was refused: each refused row and why. Nothing was written. */
export class TaskGridRefused extends Error {
  constructor(readonly refusals: TaskGridRefusal[]) {
    super('The grid was not saved.')
  }
}

const STAFF_ONLY = 'Only the Training Admin and leads edit the task list.'
const STALE =
  'The task list changed since the grid was opened. Reload it and make the changes again.'

/** A refusal's messages, as a person reads them: "Name: This field is required." */
function reasons(error: unknown): string[] {
  if (error instanceof ValidationError) {
    return error.data.errors.map(({ label, message }) =>
      label
        ? `${typeof label === 'string' ? label : Object.values(label)[0]}: ${message}`
        : message,
    )
  }
  if (error instanceof APIError) return [error.message]
  throw error
}

/** One row's save was refused. */
class RowRefused extends Error {
  constructor(
    readonly row: string,
    readonly cause: unknown,
  ) {
    super('A row was refused.')
  }
}

type Write = {
  row: string
  parent?: string | null
  run: (ids: Map<string, string>) => Promise<unknown>
}

/**
 * Saves the grid's batch, so that the answer names every refused row, not only the first. A
 * refused save rolls back the whole transaction (Payload's operations do so themselves), so the
 * batch is written in passes: each in a fresh transaction, stopping at the first refused row,
 * which the next pass leaves out with any new task beneath it. Once a pass meets no new refusal,
 * it is committed if nothing was refused and rolled back otherwise.
 */
export async function saveTaskGrid(
  req: PayloadRequest,
  batch: TaskGridBatch,
): Promise<{ created: number; updated: number }> {
  if (!isStaff(req.user as Pick<User, 'roles' | 'cid'> | null)) throw new APIError(STAFF_ONLY, 403)
  const writes = await plan(req, batch)

  const refused = new Map<string, string[]>()
  for (;;) {
    await initTransaction(req)
    try {
      const done = await writeAll(writes, refused)
      if (refused.size === 0) {
        await commitTransaction(req)
        return done
      }
      await killTransaction(req)
      throw new TaskGridRefused(
        [...refused].flatMap(([row, messages]) => messages.map((message) => ({ row, message }))),
      )
    } catch (error) {
      await killTransaction(req)
      if (!(error instanceof RowRefused)) throw error
      refused.set(error.row, reasons(error.cause))
    }
  }
}

/** Writes each row in turn, leaving out refused rows and the new tasks beneath them. */
async function writeAll(writes: Write[], refused: Map<string, string[]>) {
  const ids = new Map<string, string>()
  const skipped = new Set(refused.keys())
  let created = 0
  let updated = 0
  for (const write of writes) {
    if (skipped.has(write.row)) continue
    if (write.parent && skipped.has(write.parent)) {
      skipped.add(write.row)
      continue
    }
    try {
      const id = await write.run(ids)
      if (typeof id === 'string') {
        ids.set(write.row, id)
        created++
      } else updated++
    } catch (error) {
      throw new RowRefused(write.row, error)
    }
  }
  return { created, updated }
}

/**
 * Checks the batch against the task list as it is now and turns it into writes: new tasks first,
 * each after its parent, then one save per changed task. Refuses the whole batch if it was made
 * from a task list that has since changed.
 */
async function plan(req: PayloadRequest, batch: TaskGridBatch): Promise<Write[]> {
  const changes = batch.changes ?? []
  const adds = batch.adds ?? []
  const orders = batch.orders ?? []
  const saved = new Map((await loadGridTasks(req)).map((task) => [task.id, task]))
  const added = new Map(adds.map((add) => [add.key, add]))
  const refusals: TaskGridRefusal[] = []

  for (const change of changes) {
    if (!saved.has(change.id)) refusals.push({ row: change.id, message: STALE })
  }
  for (const add of adds) {
    if (add.parent !== null && !saved.has(add.parent) && !added.has(add.parent)) {
      refusals.push({ row: add.key, message: STALE })
    }
  }

  // The new sort keys: each group as sent must hold exactly the tasks under that parent.
  const keys = new Map<string, string>()
  const grouped = new Set<string | null>()
  for (const { parent, tasks } of orders) {
    const expected = [
      ...[...saved.values()].filter((task) => task.parentId === parent).map((task) => task.id),
      ...adds.filter((add) => add.parent === parent).map((add) => add.key),
    ]
    const same =
      !grouped.has(parent) &&
      tasks.length === expected.length &&
      new Set(tasks).size === tasks.length &&
      expected.every((id) => tasks.includes(id))
    grouped.add(parent)
    if (!same) {
      refusals.push({ message: STALE })
      continue
    }
    siblingKeys(tasks.map((id) => ({ id, key: saved.get(id)?.order || null }))).forEach((key, id) =>
      keys.set(id, key),
    )
  }
  // A new task in a group whose order wasn't sent goes last in it.
  for (const add of adds) {
    if (grouped.has(add.parent)) continue
    const siblings = [
      ...[...saved.values()].filter((task) => task.parentId === add.parent),
      ...adds
        .filter((each) => each.parent === add.parent)
        .map((each) => ({ id: each.key, order: null })),
    ]
    siblingKeys(siblings.map((each) => ({ id: each.id, key: each.order || null }))).forEach(
      (key, id) => keys.set(id, key),
    )
    grouped.add(add.parent)
  }

  // New tasks, parents first.
  const ordered: NonNullable<TaskGridBatch['adds']> = []
  let waiting = [...adds]
  while (waiting.length) {
    const ready = waiting.filter(
      (add) =>
        add.parent === null ||
        saved.has(add.parent) ||
        ordered.some((each) => each.key === add.parent),
    )
    // New tasks that are each other's parents.
    if (!ready.length) {
      refusals.push({ message: STALE })
      break
    }
    ordered.push(...ready)
    waiting = waiting.filter((add) => !ready.includes(add))
  }
  if (refusals.length) throw new TaskGridRefused(refusals)

  const as = { req, user: req.user, overrideAccess: false, depth: 0 } as const
  const writes: Write[] = ordered.map((add) => ({
    row: add.key,
    parent: add.parent,
    run: async (ids) => {
      const parent = add.parent === null ? null : (ids.get(add.parent) ?? add.parent)
      const task = await req.payload.create({
        collection: 'tasks',
        data: { name: add.name, description: add.description, parent, _order: keys.get(add.key) },
        ...as,
      })
      return task.id
    },
  }))

  // Saved tasks: only what the grid edits, and any new sort key, in one save each. A task's
  // parent changes on its own page.
  const updates = new Map<string, Record<string, unknown>>()
  for (const { id, name, description, retired } of changes) {
    const data = Object.fromEntries(
      Object.entries({ name, description, retired }).filter(([, value]) => value !== undefined),
    )
    updates.set(id, { ...updates.get(id), ...data })
  }
  for (const [id, key] of keys) {
    if (saved.has(id)) updates.set(id, { ...updates.get(id), _order: key })
  }
  for (const [id, data] of updates) {
    writes.push({
      row: id,
      run: async () => {
        await req.payload.update({ collection: 'tasks', id, data, ...as })
      },
    })
  }
  return writes
}
