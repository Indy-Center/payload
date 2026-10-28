import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload
let member: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  member = await payload.create({
    collection: 'users',
    data: { email: 'member@example.com', password: 'example-password', cid: '1000002' },
  })
})

/** The Competencies list's read, as the signed-in person the admin page is shown to. */
const tree = (query = '', user: User | null = member) =>
  callEndpoint(payload, `/courseware/competency-tree${query}`, {
    token: null,
    user: user ?? undefined,
  })

const edition = (name: string, edition: string) =>
  payload.create({ collection: 'frameworks', data: { name, edition } })

describe('the editions', () => {
  it('lists USA before GCAP, newest edition first within each', async () => {
    await edition('GCAP', '2026-10')
    await edition('USA', '2026-10')
    await edition('USA', '2027-04')

    const { status, body } = await tree()

    expect(status).toBe(200)
    expect(
      body.editions.map((e: { name: string; edition: string }) => `${e.name} ${e.edition}`),
    ).toEqual(['USA 2027-04', 'USA 2026-10', 'GCAP 2026-10'])
  })

  it('names each edition with its number of competencies', async () => {
    const usa = await edition('USA', '2026-10')
    await competency(usa.id, '9.1', 'Example heading')
    await competency(usa.id, '9.2', 'Another heading')
    await edition('GCAP', '2026-10')

    const { body } = await tree()

    expect(body.editions[0]).toEqual({
      id: usa.id,
      name: 'USA',
      edition: '2026-10',
      count: 2,
      showsPairing: true,
    })
    expect(body.editions[1]).toMatchObject({ name: 'GCAP', count: 0, showsPairing: false })
  })

  it('is for signed-in people only', async () => {
    await edition('USA', '2026-10')

    const { status } = await tree('', null)

    expect(status).toBe(401)
  })
})

async function competency(
  framework: string,
  sourceId: string,
  title: string,
  more: { parent?: string; pairedGcapCode?: string } = {},
) {
  return payload.create({
    collection: 'competencies',
    data: { framework, sourceId, title, ...more },
  })
}

const rows = (body: { edition: { competencies: Record<string, unknown>[] } }) =>
  body.edition.competencies.map(({ sourceId, depth, pairedGcapCode, hasChildren }) => ({
    sourceId,
    depth,
    pairedGcapCode,
    hasChildren,
  }))

describe("an edition's competencies", () => {
  it('opens on the first edition, each competency under its parent in the sheet’s order', async () => {
    const usa = await edition('USA', '2026-10')
    // Saved out of order: the tree orders them, not the order they were saved in.
    const nine = await competency(usa.id, '9', 'Example rating')
    const ninePointTwo = await competency(usa.id, '9.2', 'Second example', { parent: nine.id })
    await competency(usa.id, '9.10', 'Tenth example', { parent: nine.id })
    const ninePointOne = await competency(usa.id, '9.1', 'First example', { parent: nine.id })
    await competency(usa.id, '9.1.1a', 'Example detail', {
      parent: ninePointOne.id,
      pairedGcapCode: 'Z.9.a.ii',
    })
    await competency(usa.id, '9.1.1', 'Example standard', {
      parent: ninePointOne.id,
      pairedGcapCode: 'Z.9.a.i',
    })
    await competency(usa.id, '9.2.1', 'Another standard', { parent: ninePointTwo.id })
    await competency(usa.id, '8', 'Earlier rating')

    const { body } = await tree()

    expect(body.edition.id).toBe(usa.id)
    expect(rows(body)).toEqual([
      { sourceId: '8', depth: 0, pairedGcapCode: null, hasChildren: false },
      { sourceId: '9', depth: 0, pairedGcapCode: null, hasChildren: true },
      { sourceId: '9.1', depth: 1, pairedGcapCode: null, hasChildren: true },
      { sourceId: '9.1.1', depth: 2, pairedGcapCode: 'Z.9.a.i', hasChildren: false },
      { sourceId: '9.1.1a', depth: 2, pairedGcapCode: 'Z.9.a.ii', hasChildren: false },
      { sourceId: '9.2', depth: 1, pairedGcapCode: null, hasChildren: true },
      { sourceId: '9.2.1', depth: 2, pairedGcapCode: null, hasChildren: false },
      { sourceId: '9.10', depth: 1, pairedGcapCode: null, hasChildren: false },
    ])
  })

  it('reads GCAP’s Roman numerals in order, and shows no pairing on a GCAP tab', async () => {
    await edition('USA', '2026-10')
    const gcap = await edition('GCAP', '2026-10')
    for (const code of ['Z.1.a.x', 'Z.1.a.iv', 'Z.1.a.ix', 'Z.1.a.v', 'Z.1.a.i', 'Z.1.b.i']) {
      await competency(gcap.id, code, 'Example topic', { pairedGcapCode: 'Z.0.a.i' })
    }

    const { body } = await tree(`?edition=${gcap.id}`)

    expect(body.edition.name).toBe('GCAP')
    expect(rows(body).map(({ sourceId }) => sourceId)).toEqual([
      'Z.1.a.i',
      'Z.1.a.iv',
      'Z.1.a.v',
      'Z.1.a.ix',
      'Z.1.a.x',
      'Z.1.b.i',
    ])
    expect(rows(body).every(({ pairedGcapCode }) => pairedGcapCode === null)).toBe(true)
  })

  it('answers not found for an edition that is not there', async () => {
    await edition('USA', '2026-10')

    const { status } = await tree('?edition=01890000-0000-7000-8000-000000000000')

    expect(status).toBe(404)
  })
})

describe('searching a tab', () => {
  async function example() {
    const usa = await edition('USA', '2026-10')
    const rating = await competency(usa.id, '9', 'Example rating')
    const heading = await competency(usa.id, '9.1', 'Radio work', { parent: rating.id })
    const readbacks = await competency(usa.id, '9.1.1', 'Readbacks', { parent: heading.id })
    const other = await competency(usa.id, '8', 'Other rating')
    const otherReadbacks = await competency(usa.id, '8.1', 'Readbacks of headings', {
      parent: other.id,
    })
    await competency(usa.id, '8.2', 'Phraseology', { parent: other.id })
    return { usa, rating, heading, readbacks, other, otherReadbacks }
  }

  it('finds matches by title, ignoring case, with every row above them opened', async () => {
    const { usa, rating, heading, readbacks, other, otherReadbacks } = await example()

    const { body } = await tree(`?edition=${usa.id}&search=READBACK`)

    expect(body.search).toEqual({
      matches: [otherReadbacks.id, readbacks.id],
      open: [other.id, rating.id, heading.id],
    })
  })

  it('finds matches by ID', async () => {
    const { usa, heading, readbacks, rating } = await example()

    const { body } = await tree(`?edition=${usa.id}&search=9.1`)

    expect(body.search).toEqual({
      matches: [heading.id, readbacks.id],
      open: [rating.id, heading.id],
    })
  })

  it('searches nothing for an empty search', async () => {
    const { usa } = await example()

    const { body } = await tree(`?edition=${usa.id}&search=%20`)

    expect(body.search).toBeNull()
  })
})
