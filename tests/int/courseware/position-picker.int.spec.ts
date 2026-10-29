import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Position, User } from '@/payload-types'
import { callEndpoint, position, resetDatabase, testPayload } from './helpers'

/**
 * A scenario's student and teacher position pickers (decision 0060), driven through the endpoint
 * the picker reads, as a signed-in course author.
 */

let payload: Payload
let author: User
let falmouth: Position
let tower: Position

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  author = await payload.create({
    collection: 'users',
    data: { email: 'author@example.com', password: 'example-password', cid: '1000001' },
  })
  falmouth = await position(payload, 'XYZ_83_CTR', { name: 'Exampleton 83', shortName: 'EXA 83' })
  tower = await position(payload, 'ABC_TWR', { name: 'Local Control' })
  // vNAS no longer lists it.
  await position(payload, 'DEF_TWR', { name: 'Local Control', retired: true })
})

/** The picker's options, as `label` strings, for this query. */
async function pick(query: Record<string, string> = {}, user: User | null = author) {
  const { status, body } = await callEndpoint(
    payload,
    `/courseware/position-options?${new URLSearchParams(query)}`,
    { token: null, user: user ?? undefined },
  )
  return { status, body, labels: body.options?.map((option: { label: string }) => option.label) }
}

describe('the scenario position picker', () => {
  it('shows a position by short name and name, or by callsign and name, without retired ones', async () => {
    const { status, labels } = await pick()

    expect(status).toBe(200)
    expect(labels).toEqual(['ABC_TWR · Local Control', 'EXA 83 · Exampleton 83'])
  })

  it('finds a position by its short name, name or callsign, in any case', async () => {
    expect((await pick({ search: 'exa 83' })).labels).toEqual(['EXA 83 · Exampleton 83'])
    expect((await pick({ search: 'Exampleton' })).labels).toEqual(['EXA 83 · Exampleton 83'])
    expect((await pick({ search: 'xyz_83' })).labels).toEqual(['EXA 83 · Exampleton 83'])
    expect((await pick({ search: 'local' })).labels).toEqual(['ABC_TWR · Local Control'])
    expect((await pick({ search: 'nowhere' })).labels).toEqual([])
  })

  it('offers a retired position the scenario already names', async () => {
    const course = await payload.create({
      collection: 'courses',
      data: { code: 'X-TWR', title: 'Example Tower', authors: [author.cid!] },
    })
    const scenario = await payload.create({
      collection: 'scenarios',
      data: {
        course: course.id,
        name: 'Busy afternoon',
        airport: 'KXYZ',
        studentPosition: tower.id,
        teacherPosition: falmouth.id,
        mode: 'sim',
      },
    })
    await payload.update({ collection: 'positions', id: tower.id, data: { retired: true } })

    expect((await pick({ scenario: scenario.id })).labels).toEqual([
      'ABC_TWR · Local Control',
      'EXA 83 · Exampleton 83',
    ])
    // Not for a scenario that doesn't name it.
    expect((await pick()).labels).toEqual(['EXA 83 · Exampleton 83'])
  })

  it('labels the chosen position whatever the search', async () => {
    const { body } = await pick({ search: 'local', current: falmouth.id })

    expect(body.selected).toEqual({ id: falmouth.id, label: 'EXA 83 · Exampleton 83' })
    expect(body.options).toEqual([{ id: tower.id, label: 'ABC_TWR · Local Control' }])
  })

  it('refuses a request from no one signed in', async () => {
    const { status, body } = await pick({}, null)

    expect(status).toBe(401)
    expect(body).not.toHaveProperty('options')
  })
})
