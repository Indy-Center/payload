import { createLocalReq, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadTaskTreeList } from '@/courseware/task-tree-list'
import type { Task, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload
let lead: User
let author: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  lead = await payload.create({
    collection: 'users',
    data: { email: 'lead@example.com', password: 'example-password', roles: ['training:lead'] },
  })
  author = await payload.create({
    collection: 'users',
    data: { email: 'author@example.com', password: 'example-password', cid: '1000001' },
  })
  await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', authors: [author.cid!] },
  })
})

async function task(name: string, parent?: string, extra: Record<string, unknown> = {}) {
  return payload.create({ collection: 'tasks', data: { name, parent, ...extra } })
}

/** A made-up tree: 1 Radio; 2 Ground > 2.1 Taxi > 2.1.1, 2.1.2, 2.1.3 (with 2.1.3.1), 2.2. */
async function seedTree() {
  await task('Radio')
  const ground = await task('Ground')
  const taxi = await task('Taxi', ground.id)
  const runway = await task('Taxi to runway', taxi.id)
  const hold = await task('Hold short', taxi.id)
  const ramp = await task('Taxi to ramp', taxi.id)
  await task('Ramp entry', ramp.id)
  await task('Crossings', ground.id)
  return { ground, taxi, runway, hold, ramp }
}

/** Every task as "number name", in tree order, as a lead's Tasks list numbers it. */
async function numbered() {
  const req = await createLocalReq({ user: { ...lead, collection: 'users' } }, payload)
  const { rows } = await loadTaskTreeList(req)
  return rows.map((row) => `${row.number} ${row.name}`)
}

const move = (subject: Task, direction: 'up' | 'down', user: User = lead) =>
  callEndpoint(payload, `/courseware/tasks/${subject.id}/move`, {
    method: 'post',
    token: null,
    user,
    body: { direction },
  })

describe('moving a task among its siblings', () => {
  it('renumbers the task, the tasks beneath it and the sibling it passed', async () => {
    const { ramp } = await seedTree()

    const { status, body } = await move(ramp, 'up')

    expect(status).toBe(200)
    expect(body.message).toBe('2.1.3 Taxi to ramp is now 2.1.2')
    expect(await numbered()).toEqual([
      '1 Radio',
      '2 Ground',
      '2.1 Taxi',
      '2.1.1 Taxi to runway',
      '2.1.2 Taxi to ramp',
      '2.1.2.1 Ramp entry',
      '2.1.3 Hold short',
      '2.2 Crossings',
    ])
  })

  it('moves a task down, renumbering its later sibling', async () => {
    const { runway } = await seedTree()

    const { body } = await move(runway, 'down')

    expect(body.message).toBe('2.1.1 Taxi to runway is now 2.1.2')
    expect((await numbered()).slice(3, 6)).toEqual([
      '2.1.1 Hold short',
      '2.1.2 Taxi to runway',
      '2.1.3 Taxi to ramp',
    ])
  })

  it('rewrites the sort key of the moved task only', async () => {
    const { ramp } = await seedTree()
    const before = await payload.find({ collection: 'tasks', pagination: false, depth: 0 })

    await move(ramp, 'up')

    const after = await payload.find({ collection: 'tasks', pagination: false, depth: 0 })
    const changed = after.docs.filter(
      (doc) => before.docs.find((each) => each.id === doc.id)?._order !== doc._order,
    )
    expect(changed.map((doc) => doc.id)).toEqual([ramp.id])
  })

  it('refuses to move the first sibling up or the last one down', async () => {
    const { runway, ramp } = await seedTree()

    const up = await move(runway, 'up')
    const down = await move(ramp, 'down')

    expect(up.status).toBe(400)
    expect(up.body.errors).toEqual([{ message: '2.1.1 Taxi to runway is already first.' }])
    expect(down.status).toBe(400)
    expect(down.body.errors).toEqual([{ message: '2.1.3 Taxi to ramp is already last.' }])
  })

  it('asks for the order to be repaired when siblings share a sort key', async () => {
    const parent = await task('Ground')
    await task('Taxi', parent.id, { _order: 'a0' })
    await task('Hold short', parent.id, { _order: 'a0' })
    const third = await task('Crossings', parent.id, { _order: 'a1' })

    const { status, body } = await move(third, 'up')

    expect(status).toBe(400)
    expect(body.errors).toEqual([
      { message: 'The order of these tasks needs repairing; save them in the grid once.' },
    ])
  })

  it('refuses a body that is not JSON', async () => {
    const { ramp } = await seedTree()

    const { status, body } = await callEndpoint(payload, `/courseware/tasks/${ramp.id}/move`, {
      method: 'post',
      token: null,
      user: lead,
      // What `req.json()` throws for a body that isn't JSON.
      body: new SyntaxError('Unexpected token < in JSON'),
    })

    expect(status).toBe(400)
    expect(body.errors).toEqual([{ message: 'Move a task up or down.' }])
  })

  it('is refused for a course author, and nothing moves', async () => {
    const { ramp } = await seedTree()
    const before = await numbered()

    const { status, body } = await move(ramp, 'up', author)

    expect(status).toBe(403)
    expect(body.errors).toEqual([
      { message: 'Only the Training Admin and lead instructors may move tasks.' },
    ])
    expect(await numbered()).toEqual(before)
  })

  it('offers each task the moves it has, to the Training Admin and leads only', async () => {
    const { runway, hold, ramp } = await seedTree()
    const rows = async (user: User) => {
      const req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
      return (await loadTaskTreeList(req)).rows
    }

    const forLead = await rows(lead)
    const moves = (id: string) => forLead.find((row) => row.id === id)?.moves
    expect(moves(runway.id)).toEqual({ up: false, down: true })
    expect(moves(hold.id)).toEqual({ up: true, down: true })
    expect(moves(ramp.id)).toEqual({ up: true, down: false })
    expect((await rows(author)).every((row) => row.moves === null)).toBe(true)
  })
})
