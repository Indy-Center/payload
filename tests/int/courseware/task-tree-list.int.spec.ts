import { createLocalReq, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadTaskTreeList, type TaskTreeListOptions } from '@/courseware/task-tree-list'
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

/** The Tasks list as a signed-in lead sees it: each row as "number name", indented by depth. */
async function list(options: TaskTreeListOptions = {}) {
  const req = await createLocalReq({ user: { ...lead, collection: 'users' } }, payload)
  return loadTaskTreeList(req, options)
}

const shown = (result: Awaited<ReturnType<typeof list>>) =>
  result.rows.map((row) => `${'  '.repeat(row.depth)}${row.number} ${row.name}`)

/** A small made-up tree, three levels deep, with one retired task in the middle of a level. */
async function seedTree() {
  const radio = await task('Radio', undefined, { description: 'Talking on frequency' })
  const ground = await task('Ground')
  await task('Readbacks', radio.id)
  const taxi = await task('Taxi', ground.id)
  await task('Taxi to runway', taxi.id, { description: 'Route and hold short' })
  await task('Taxi to ramp', taxi.id, { retired: true })
  await task('Taxi via route', taxi.id)
  await task('Crossings', ground.id)
  return { radio, ground, taxi }
}

describe('the Tasks list', () => {
  it('lists the whole tree in tree order, each task with its number, name and description', async () => {
    await seedTree()

    const result = await list()

    expect(shown(result)).toEqual([
      '1 Radio',
      '  1.1 Readbacks',
      '2 Ground',
      '  2.1 Taxi',
      '    2.1.1 Taxi to runway',
      '    2.1.3 Taxi via route',
      '  2.2 Crossings',
    ])
    expect(result.rows[0]).toMatchObject({ description: 'Talking on frequency', retired: false })
    expect(result.rows.find((row) => row.name === 'Taxi to runway')?.description).toBe(
      'Route and hold short',
    )
  })

  it('says which tasks have children to open, and opens none of them itself', async () => {
    const { radio, taxi } = await seedTree()

    const result = await list()

    const parents = result.rows.filter((row) => row.hasChildren).map((row) => row.name)
    expect(parents).toEqual(['Radio', 'Ground', 'Taxi'])
    expect(result.rows.find((row) => row.id === taxi.id)?.parentId).toBeTruthy()
    expect(result.rows.find((row) => row.id === radio.id)?.parentId).toBeNull()
    expect(result.opened).toEqual([])
  })

  it('shows retired tasks when asked, keeping their own number', async () => {
    await seedTree()

    const result = await list({ showRetired: true })

    expect(shown(result)).toContain('    2.1.2 Taxi to ramp')
    expect(result.rows.find((row) => row.name === 'Taxi to ramp')?.retired).toBe(true)
  })

  it('hides the tasks beneath a retired task along with it', async () => {
    const radio = await task('Radio')
    await task('Readbacks', radio.id)
    await task('Ground')
    await payload.update({ collection: 'tasks', id: radio.id, data: { retired: true } })

    expect(shown(await list())).toEqual(['2 Ground'])
  })

  it('does not offer to open a task whose only children are retired', async () => {
    const radio = await task('Radio')
    await task('Readbacks', radio.id, { retired: true })

    expect((await list()).rows[0].hasChildren).toBe(false)
    expect((await list({ showRetired: true })).rows[0].hasChildren).toBe(true)
  })

  it('finds tasks by name, showing each match under its parents, opened', async () => {
    const { ground, taxi } = await seedTree()

    const result = await list({ search: 'runway' })

    expect(shown(result)).toEqual(['2 Ground', '  2.1 Taxi', '    2.1.1 Taxi to runway'])
    expect(result.opened.sort()).toEqual([ground.id, taxi.id].sort())
  })

  it('matches names without regard to case, and every match, at any depth', async () => {
    await seedTree()

    const result = await list({ search: 'TAXI' })

    expect(shown(result)).toEqual([
      '2 Ground',
      '  2.1 Taxi',
      '    2.1.1 Taxi to runway',
      '    2.1.3 Taxi via route',
    ])
  })

  it('is read as the person signed in, so no one signed out sees the tree', async () => {
    await seedTree()
    const signedOut = await createLocalReq({}, payload)

    await expect(loadTaskTreeList(signedOut)).rejects.toThrow('You are not allowed')
  })

  it('leaves retired tasks out of a search unless asked', async () => {
    await seedTree()

    expect(shown(await list({ search: 'ramp' }))).toEqual([])
    expect(shown(await list({ search: 'ramp', showRetired: true }))).toEqual([
      '2 Ground',
      '  2.1 Taxi',
      '    2.1.2 Taxi to ramp',
    ])
  })
})
