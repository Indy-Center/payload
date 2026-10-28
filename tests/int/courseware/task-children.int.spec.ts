import { createLocalReq, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadTaskChildren } from '@/courseware/task-children'
import type { User } from '@/payload-types'
import { resetDatabase, testPayload } from './helpers'

let payload: Payload
let lead: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  lead = await payload.create({
    collection: 'users',
    data: { email: 'lead@example.com', password: 'example-password', roles: ['training:lead'] },
  })
})

async function task(name: string, parent?: string, extra: Record<string, unknown> = {}) {
  return payload.create({ collection: 'tasks', data: { name, parent, ...extra } })
}

/** A task's children as a signed-in lead sees them on its page. */
async function childrenOf(id: string) {
  const req = await createLocalReq({ user: { ...lead, collection: 'users' } }, payload)
  return loadTaskChildren(req, id)
}

/** 2 Ground > 2.1 Taxi > 2.1.1 to 2.1.4 (the second retired, the third with two tasks beneath). */
async function seedTree() {
  await task('Radio')
  const ground = await task('Ground')
  const taxi = await task('Taxi', ground.id, { description: 'Moving on the surface' })
  await task('Taxi to runway', taxi.id, { description: 'Route and hold short' })
  await task('Taxi to ramp', taxi.id, { retired: true })
  const via = await task('Taxi via route', taxi.id)
  await task('Hold short', via.id)
  await task('Cross runway', via.id)
  await task('Taxi at night', taxi.id)
  return { ground, taxi, via }
}

describe("a task's children", () => {
  it('lists the direct children in tree order with their numbers and descriptions', async () => {
    const { taxi } = await seedTree()

    const { children } = await childrenOf(taxi.id)

    expect(children.map((child) => `${child.number} ${child.name}`)).toEqual([
      '2.1.1 Taxi to runway',
      '2.1.3 Taxi via route',
      '2.1.4 Taxi at night',
    ])
    expect(children[0].description).toBe('Route and hold short')
  })

  it('counts the tasks beneath a child, and none for a child with nothing beneath', async () => {
    const { taxi } = await seedTree()

    const { children } = await childrenOf(taxi.id)

    expect(children.map((child) => child.beneath)).toEqual([0, 2, 0])
  })

  it('leaves retired children out and names them with their numbers', async () => {
    const { taxi } = await seedTree()
    await task('Taxi in snow', taxi.id, { retired: true })

    const { children, retired } = await childrenOf(taxi.id)

    expect(children.map((child) => child.name)).not.toContain('Taxi to ramp')
    expect(retired).toEqual([
      { number: '2.1.2', name: 'Taxi to ramp' },
      { number: '2.1.5', name: 'Taxi in snow' },
    ])
  })

  it('says the number a new child will get: after every child, retired ones included', async () => {
    const { taxi, ground } = await seedTree()

    expect((await childrenOf(taxi.id)).nextNumber).toBe('2.1.5')
    expect((await childrenOf(ground.id)).nextNumber).toBe('2.2')
  })

  it('has no children, no retired and the first number for a task with nothing beneath it', async () => {
    await task('Radio')
    const lonely = await task('Lonely', (await task('Parent')).id)

    expect(await childrenOf(lonely.id)).toEqual({
      children: [],
      retired: [],
      nextNumber: '2.1.1',
    })
  })

  it('is empty for a task that is not there', async () => {
    expect(await childrenOf('9999')).toEqual({ children: [], retired: [], nextNumber: '' })
  })

  it('puts a task created beneath this one last', async () => {
    const { taxi } = await seedTree()
    const added = await task('Taxi by tug', taxi.id)

    const { children } = await childrenOf(taxi.id)

    expect(children.at(-1)).toMatchObject({ id: added.id, number: '2.1.5' })
  })
})
