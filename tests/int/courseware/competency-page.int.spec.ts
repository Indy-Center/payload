import { createLocalReq, type Payload, type SanitizedCollectionConfig } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { loadCompetencyPage } from '@/courseware/competency-page'
import { resetDatabase, testPayload } from './helpers'

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

/** The page's read, as the signed-in person the admin page is shown to. */
async function page(id: string) {
  const req = await createLocalReq({ user: { ...member, collection: 'users' } }, payload)
  return loadCompetencyPage(req, id)
}

const competency = async (
  framework: string,
  sourceId: string,
  title: string,
  more: { parent?: string; text?: string } = {},
) => payload.create({ collection: 'competencies', data: { framework, sourceId, title, ...more } })

const task = (name: string, extra: Record<string, unknown> = {}) =>
  payload.create({ collection: 'tasks', data: { name, ...extra } as never })

describe("a competency's children", () => {
  it('lists the direct children in the sheet’s order, with how many each has beneath it', async () => {
    const usa = await payload.create({
      collection: 'frameworks',
      data: { name: 'USA', edition: '2026-10' },
    })
    const rating = await competency(usa.id, '9', 'Example rating')
    // Saved out of order: the page orders them, and counts a child's own children, not listing them.
    const second = await competency(usa.id, '9.10', 'Tenth example', { parent: rating.id })
    const first = await competency(usa.id, '9.2', 'Second example', {
      parent: rating.id,
      text: 'Example wording.',
    })
    await competency(usa.id, '9.2.1', 'Deeper example', { parent: first.id, text: 'More.' })
    await competency(usa.id, '9.2.2', 'Deeper again', { parent: first.id, text: 'More.' })
    await competency(usa.id, '9.2.2a', 'Third child', { parent: first.id })

    const { children } = await page(rating.id)

    expect(children).toEqual([
      {
        id: first.id,
        sourceId: '9.2',
        title: 'Second example',
        text: 'Example wording.',
        beneath: 3,
      },
      { id: second.id, sourceId: '9.10', title: 'Tenth example', text: '', beneath: 0 },
    ])
  })

  it('has none for a competency with no children', async () => {
    const usa = await payload.create({
      collection: 'frameworks',
      data: { name: 'USA', edition: '2026-10' },
    })
    const leaf = await competency(usa.id, '9.1', 'Example', { text: 'Wording.' })

    expect((await page(leaf.id)).children).toEqual([])
  })
})

describe('taught by', () => {
  async function example() {
    const usa = await payload.create({
      collection: 'frameworks',
      data: { name: 'USA', edition: '2026-10' },
    })
    const standard = await competency(usa.id, '9.1', 'Example standard', { text: 'Wording.' })
    const other = await competency(usa.id, '9.2', 'Other standard', { text: 'Wording.' })
    return { standard, other }
  }

  it('lists the tasks mapped to it with their numbers today, leaving out retired ones', async () => {
    const { standard, other } = await example()
    await task('Radio')
    const clearances = await task('Clearances', { mappings: [{ competency: standard.id }] })
    await task('Unrelated', { mappings: [{ competency: other.id }] })
    await task('Old habit', { retired: true, mappings: [{ competency: standard.id }] })
    const readbacks = await task('Readbacks', {
      parent: clearances.id,
      mappings: [{ competency: standard.id }, { competency: other.id }],
    })

    const { taughtBy } = await page(standard.id)

    expect(taughtBy).toEqual([
      { id: clearances.id, number: '2', name: 'Clearances' },
      { id: readbacks.id, number: '2.1', name: 'Readbacks' },
    ])
  })

  it('has none when no task maps to it', async () => {
    const { standard } = await example()
    await task('Old habit', { retired: true, mappings: [{ competency: standard.id }] })

    expect((await page(standard.id)).taughtBy).toEqual([])
  })
})

describe('the admin shows a competency read-only', () => {
  const config = () => payload.collections['competencies'].config as SanitizedCollectionConfig

  it('marks every field read-only', () => {
    const shown = [
      'framework',
      'sourceId',
      'title',
      'text',
      'parent',
      'sourceReference',
      'rubricTheory',
      'rubricPractical',
      'pairedGcapCode',
    ]
    for (const name of shown) {
      const field = config().fields.find(
        (candidate) => 'name' in candidate && candidate.name === name,
      )
      expect((field?.admin as { readOnly?: boolean } | undefined)?.readOnly, name).toBe(true)
    }
  })

  it('offers no Duplicate, and keeps the access rules', () => {
    expect(config().disableDuplicate).toBe(true)
    expect(config().access.delete?.({} as never)).toBe(false)
  })
})

describe('the import still writes competencies', () => {
  it('creates and updates them as a staff user', async () => {
    const staff = await payload.create({
      collection: 'users',
      data: {
        email: 'staff@example.com',
        password: 'example-password',
        roles: ['training:lead'],
      },
    })
    const user = { ...staff, collection: 'users' as const }
    const usa = await payload.create({
      collection: 'frameworks',
      data: { name: 'USA', edition: '2026-10' },
    })

    const made = await payload.create({
      collection: 'competencies',
      data: { framework: usa.id, sourceId: '9.1', title: 'Example' },
      user,
      overrideAccess: false,
    })
    const changed = await payload.update({
      collection: 'competencies',
      id: made.id,
      data: { title: 'Reworded' },
      user,
      overrideAccess: false,
    })

    expect(changed.title).toBe('Reworded')
  })
})
