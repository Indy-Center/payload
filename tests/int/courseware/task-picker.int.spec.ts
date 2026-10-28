import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload
let author: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  // Authors pick tasks for their lesson plans and scenarios, so the picker is theirs too.
  author = await payload.create({
    collection: 'users',
    data: { email: 'author@example.com', password: 'example-password', cid: '1000001' },
  })
})

async function task(name: string, parent?: string, extra: Record<string, unknown> = {}) {
  return payload.create({ collection: 'tasks', data: { name, parent, ...extra } })
}

/** A made-up tree: 1 Radio; 2 Ground > 2.1 Clearances, 2.2 Taxi > 2.2.1, 2.2.2 (retired), 2.2.3. */
async function seedTree() {
  const radio = await task('Radio')
  const ground = await task('Ground')
  await task('Clearances', ground.id)
  const taxi = await task('Taxi', ground.id)
  const runway = await task('Taxi to runway', taxi.id)
  const retired = await task('Taxi via route', taxi.id, { retired: true })
  await task('Taxi to ramp', taxi.id)
  await task('Readbacks', radio.id)
  return { radio, ground, taxi, runway, retired }
}

/** The picker's options for a search, as their labels. */
async function pick(query: Record<string, string> = {}) {
  const { status, body } = await callEndpoint(
    payload,
    `/courseware/task-options?${new URLSearchParams(query)}`,
    { token: null, user: author },
  )
  expect(status).toBe(200)
  return (body.options as { id: string; label: string }[]).map((option) => option.label)
}

describe('the task picker', () => {
  it('lists every live task as "number name", in tree order', async () => {
    await seedTree()

    expect(await pick()).toEqual([
      '1 Radio',
      '1.1 Readbacks',
      '2 Ground',
      '2.1 Clearances',
      '2.2 Taxi',
      '2.2.1 Taxi to runway',
      '2.2.3 Taxi to ramp',
    ])
  })

  it('finds a number and everything beneath it', async () => {
    await seedTree()

    expect(await pick({ search: '2.2' })).toEqual([
      '2.2 Taxi',
      '2.2.1 Taxi to runway',
      '2.2.3 Taxi to ramp',
    ])
    expect(await pick({ search: '2.2.1' })).toEqual(['2.2.1 Taxi to runway'])
  })

  it('finds part of a name, in any case', async () => {
    await seedTree()

    expect(await pick({ search: 'RAMP' })).toEqual(['2.2.3 Taxi to ramp'])
  })

  it('keeps the task already chosen, though retired, and can leave out the task itself', async () => {
    const { retired, taxi } = await seedTree()

    expect(await pick({ search: 'via', current: retired.id })).toEqual(['2.2.2 Taxi via route'])
    expect(await pick({ search: '2.2', exclude: taxi.id })).not.toContain('2.2 Taxi')
  })

  it('labels the task already chosen, whatever the search', async () => {
    const { runway } = await seedTree()

    const { body } = await callEndpoint(
      payload,
      `/courseware/task-options?search=Radio&current=${runway.id}`,
      { token: null, user: author },
    )

    expect(body.selected).toEqual({
      id: runway.id,
      number: '2.2.1',
      label: '2.2.1 Taxi to runway',
    })
  })

  it('leaves a task and everything beneath it out of its own Parent picker', async () => {
    const { ground } = await seedTree()

    expect(await pick({ exclude: ground.id })).toEqual(['1 Radio', '1.1 Readbacks'])
  })

  it('refuses a task beneath it as a task’s parent, which would make a loop', async () => {
    const { ground, runway } = await seedTree()
    const lead = await payload.create({
      collection: 'users',
      data: { email: 'lead@example.com', password: 'example-password', roles: ['training:lead'] },
    })

    const saving = payload.update({
      collection: 'tasks',
      id: ground.id,
      data: { parent: runway.id },
      user: lead,
      overrideAccess: false,
    })

    await expect(saving).rejects.toMatchObject({
      data: {
        errors: [
          {
            path: 'parent',
            message: '2.2.1 Taxi to runway is beneath this task, so it can’t be its parent.',
          },
        ],
      },
    })
  })

  it('answers 401 to anyone not signed in', async () => {
    const { status } = await callEndpoint(payload, '/courseware/task-options', { token: null })

    expect(status).toBe(401)
  })
})
