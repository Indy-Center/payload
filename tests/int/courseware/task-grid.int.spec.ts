import { createLocalReq, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadTaskTreeList } from '@/courseware/task-tree-list'
import type { User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

/**
 * The Tasks grid's save (decisions 0022, 0025): every pending change in one batch, written in one
 * transaction as the signed-in person, all or nothing. Driven through its endpoint.
 */

let payload: Payload
let lead: User
let author: User

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, cid: string, roles: User['roles'] = []): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', cid, roles },
  })
}

beforeEach(async () => {
  await resetDatabase(payload)
  lead = await account('lead@example.com', '1000009', ['training:lead'])
  author = await account('author@example.com', '1000001')
  await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', authors: [author.cid!] },
  })
})

async function task(name: string, parent?: string, extra: Record<string, unknown> = {}) {
  return payload.create({ collection: 'tasks', data: { name, parent, ...extra } })
}

/** A small made-up tree, three levels deep. */
async function seedTree() {
  const radio = await task('Radio', undefined, { description: 'Talking on frequency' })
  const readbacks = await task('Readbacks', radio.id)
  const ground = await task('Ground')
  const taxi = await task('Taxi', ground.id)
  const runway = await task('Taxi to runway', taxi.id)
  const ramp = await task('Taxi to ramp', taxi.id)
  const crossings = await task('Crossings', ground.id)
  return { radio, readbacks, ground, taxi, runway, ramp, crossings }
}

/** The Tasks list as the lead sees it, retired tasks included: "number name", indented. */
async function tree() {
  const req = await createLocalReq({ user: { ...lead, collection: 'users' } }, payload)
  const { rows } = await loadTaskTreeList(req, { showRetired: true })
  return rows.map(
    (row) =>
      `${'  '.repeat(row.depth)}${row.number} ${row.name}${row.description ? ` (${row.description})` : ''}${row.retired ? ' [retired]' : ''}`,
  )
}

const save = (body: unknown, user: User | null = lead) =>
  callEndpoint(payload, '/courseware/task-grid', {
    method: 'post',
    token: null,
    body,
    ...(user ? { user } : {}),
  })

describe('saving the Tasks grid', () => {
  it('saves a batch of edits, adds, moves and retires as one', async () => {
    const t = await seedTree()

    const { status } = await save({
      changes: [
        { id: t.radio.id, name: 'Radio work', description: 'On frequency' },
        { id: t.crossings.id, retired: true },
      ],
      adds: [
        // Below "Taxi to runway", and a child of that new task.
        { key: 'new:1', parent: t.taxi.id, name: 'Taxi to hold', description: 'Short of it' },
        { key: 'new:2', parent: 'new:1', name: 'Hold short' },
        // The first child of a task with none.
        { key: 'new:3', parent: t.readbacks.id, name: 'Numbers' },
      ],
      orders: [
        // Ground moves above Radio.
        { parent: null, tasks: [t.ground.id, t.radio.id] },
        // Ramp moves up; the new task lands between the two.
        { parent: t.taxi.id, tasks: [t.ramp.id, 'new:1', t.runway.id] },
        { parent: 'new:1', tasks: ['new:2'] },
        { parent: t.readbacks.id, tasks: ['new:3'] },
      ],
    })

    expect(status).toBe(200)
    expect(await tree()).toEqual([
      '1 Ground',
      '  1.1 Taxi',
      '    1.1.1 Taxi to ramp',
      '    1.1.2 Taxi to hold (Short of it)',
      '      1.1.2.1 Hold short',
      '    1.1.3 Taxi to runway',
      '  1.2 Crossings [retired]',
      '2 Radio work (On frequency)',
      '  2.1 Readbacks',
      '    2.1.1 Numbers',
    ])
  })

  it('writes nothing when one row is refused, and names each refused row and why', async () => {
    const t = await seedTree()
    const before = await tree()

    const { status, body } = await save({
      changes: [
        { id: t.radio.id, name: 'Radio work' },
        { id: t.runway.id, name: '' },
      ],
      adds: [
        { key: 'new:1', parent: t.taxi.id, name: 'Taxi to hold' },
        { key: 'new:2', parent: t.taxi.id, name: '' },
      ],
      orders: [
        { parent: null, tasks: [t.ground.id, t.radio.id] },
        { parent: t.taxi.id, tasks: [t.runway.id, t.ramp.id, 'new:1', 'new:2'] },
      ],
    })

    expect(status).toBe(400)
    expect(body.errors).toEqual([
      { row: t.runway.id, message: 'Name: This field is required.' },
      { row: 'new:2', message: 'Name: This field is required.' },
    ])
    expect(await tree()).toEqual(before)
  })

  it('un-retires a task', async () => {
    const radio = await task('Radio', undefined, { retired: true })

    const { status } = await save({ changes: [{ id: radio.id, retired: false }] })

    expect(status).toBe(200)
    expect(await tree()).toEqual(['1 Radio'])
  })

  it('refuses an order that no longer holds every task under its parent', async () => {
    const t = await seedTree()
    // Someone else added a task under Taxi after the grid was opened.
    await task('Taxi to gate', t.taxi.id)
    const before = await tree()

    const { status, body } = await save({
      orders: [{ parent: t.taxi.id, tasks: [t.ramp.id, t.runway.id] }],
    })

    expect(status).toBe(400)
    expect(body.errors).toEqual([
      {
        message:
          'The task list changed since the grid was opened. Reload it and make the changes again.',
      },
    ])
    expect(await tree()).toEqual(before)
  })

  it('refuses a course author, who does not keep the task list (0022)', async () => {
    const t = await seedTree()
    const before = await tree()

    const { status, body } = await save(
      {
        changes: [{ id: t.radio.id, name: 'Radio work' }],
        adds: [{ key: 'new:1', parent: null, name: 'Weather' }],
      },
      author,
    )

    expect(status).toBe(403)
    expect(body.errors).toEqual([
      { message: 'Only the Training Admin and leads edit the task list.' },
    ])
    expect(await tree()).toEqual(before)
  })

  it('refuses a new task under a task the same batch retires', async () => {
    const t = await seedTree()
    const before = await tree()

    const { status, body } = await save({
      changes: [{ id: t.taxi.id, retired: true }],
      adds: [{ key: 'new:1', parent: t.taxi.id, name: 'Taxi to hold' }],
      orders: [{ parent: t.taxi.id, tasks: [t.runway.id, t.ramp.id, 'new:1'] }],
    })

    expect(status).toBe(400)
    expect(body.errors).toEqual([
      {
        row: 'new:1',
        message: 'Its parent is being retired. Keep the parent or remove this task.',
      },
    ])
    expect(await tree()).toEqual(before)
  })

  it('retires a task and its children while renaming them, in one batch', async () => {
    const t = await seedTree()

    const { status } = await save({
      // Listed parent first: the save still writes the children before retiring the parent.
      changes: [
        { id: t.taxi.id, retired: true },
        { id: t.runway.id, name: 'Taxi to the runway', retired: true },
        { id: t.ramp.id, name: 'Taxi to the ramp' },
      ],
    })

    expect(status).toBe(200)
    expect(await tree()).toEqual([
      '1 Radio (Talking on frequency)',
      '  1.1 Readbacks',
      '2 Ground',
      '  2.1 Taxi [retired]',
      '    2.1.1 Taxi to the runway [retired]',
      '    2.1.2 Taxi to the ramp',
      '  2.2 Crossings',
    ])
  })

  describe('under a retired task', () => {
    /** Radio with Readbacks under it, Radio then retired. */
    async function retiredParent(childRetired: boolean) {
      const radio = await task('Radio')
      const readbacks = await task('Readbacks', radio.id, { retired: childRetired })
      await payload.update({ collection: 'tasks', id: radio.id, data: { retired: true } })
      return { radio, readbacks }
    }

    it('un-retires a task only with its parent', async () => {
      const { radio, readbacks } = await retiredParent(true)

      const alone = await save({ changes: [{ id: readbacks.id, retired: false }] })
      expect(alone.status).toBe(400)
      expect(alone.body.errors).toEqual([
        { row: readbacks.id, message: 'Its parent is retired. Un-retire the parent first.' },
      ])

      const both = await save({
        // Listed child first: the save un-retires the parent first.
        changes: [
          { id: readbacks.id, retired: false },
          { id: radio.id, retired: false },
        ],
      })
      expect(both.status).toBe(200)
      expect(await tree()).toEqual(['1 Radio', '  1.1 Readbacks'])
    })

    it('does not rename a task whose parent is retired', async () => {
      const { readbacks } = await retiredParent(false)

      const { status, body } = await save({ changes: [{ id: readbacks.id, name: 'Read back' }] })

      expect(status).toBe(400)
      expect(body.errors).toEqual([
        { row: readbacks.id, message: 'Its parent is retired. Un-retire the parent first.' },
      ])
    })
  })

  it('answers 401 to a request with no one signed in', async () => {
    expect((await save({}, null)).status).toBe(401)
  })
})
