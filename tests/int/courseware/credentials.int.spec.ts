import { Forbidden, ValidationError, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Credential, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload
let admin: User
let lead: User
let author: User
let member: User

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
  admin = await account('admin@example.com', '1000000', ['training:admin'])
  lead = await account('lead@example.com', '1000009', ['training:lead'])
  author = await account('author@example.com', '1000001')
  member = await account('member@example.com', '1000002')
  await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', authors: [author.cid!] },
  })
})

const as = (user: User) => ({ user, overrideAccess: false })

const certification = {
  code: 'X-GC',
  kind: 'certification',
  name: 'Example Ground',
  description: 'Ground control at an example field.',
  rank: 1,
  grantedOnArrival: ['S1'],
} satisfies Partial<Credential>

const endorsement = {
  code: 'X-LC',
  kind: 'endorsement',
  name: 'Example Local',
} satisfies Partial<Credential>

async function refusal(promise: Promise<unknown>): Promise<{ path: string; message: string }[]> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError)
      return error.data.errors.map(({ path, message }) => ({ path, message }))
    throw error
  }
  throw new Error('Expected the save to be refused')
}

describe('credentials', () => {
  it('are created and edited by the Training Admin and leads', async () => {
    const created = await payload.create({
      collection: 'credentials',
      data: certification,
      ...as(admin),
    })
    expect(created).toMatchObject({ ...certification, retired: false })

    const edited = await payload.update({
      collection: 'credentials',
      id: created.id,
      data: { name: 'Example Ground Control', retired: true },
      ...as(lead),
    })
    expect(edited).toMatchObject({ name: 'Example Ground Control', retired: true })

    const byLead = await payload.create({
      collection: 'credentials',
      data: endorsement,
      ...as(lead),
    })
    expect(byLead).toMatchObject({ ...endorsement, rank: null, grantedOnArrival: [] })
  })

  it('are read by course authors and every other account, who may not create or edit them', async () => {
    const existing = await payload.create({ collection: 'credentials', data: certification })

    for (const user of [author, member]) {
      const read = await payload.findByID({
        collection: 'credentials',
        id: existing.id,
        ...as(user),
      })
      expect(read).toMatchObject(certification)

      await expect(
        payload.create({ collection: 'credentials', data: endorsement, ...as(user) }),
      ).rejects.toBeInstanceOf(Forbidden)
      await expect(
        payload.update({
          collection: 'credentials',
          id: existing.id,
          data: { name: 'Renamed' },
          ...as(user),
        }),
      ).rejects.toBeInstanceOf(Forbidden)
    }
    expect((await payload.findByID({ collection: 'credentials', id: existing.id })).name).toBe(
      certification.name,
    )
  })

  it('are deleted by nobody', async () => {
    const existing = await payload.create({ collection: 'credentials', data: certification })

    for (const user of [admin, lead, author]) {
      await expect(
        payload.delete({ collection: 'credentials', id: existing.id, ...as(user) }),
      ).rejects.toBeInstanceOf(Forbidden)
    }
    expect(await payload.findByID({ collection: 'credentials', id: existing.id })).toBeTruthy()
  })

  it('need a code, a kind and a name', async () => {
    const errors = await refusal(
      // @ts-expect-error -- the required fields are left out on purpose
      payload.create({
        collection: 'credentials',
        data: { description: 'Nothing else.' },
        ...as(lead),
      }),
    )
    expect(errors.map(({ path }) => path).sort()).toEqual(['code', 'kind', 'name'])
  })

  it('never share a code', async () => {
    await payload.create({ collection: 'credentials', data: certification, ...as(lead) })

    expect(
      await refusal(
        payload.create({
          collection: 'credentials',
          data: { ...endorsement, code: certification.code },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'code', message: 'Value must be unique' }])
  })

  it('give each certification its own rank', async () => {
    const first = await payload.create({
      collection: 'credentials',
      data: certification,
      ...as(lead),
    })
    const second = await payload.create({
      collection: 'credentials',
      data: { ...certification, code: 'X-TC', rank: 2, grantedOnArrival: [] },
      ...as(lead),
    })

    const clash = 'X-GC already has rank 1. Each certification has its own rank.'
    expect(
      await refusal(
        payload.create({
          collection: 'credentials',
          data: { ...certification, code: 'X-RC', grantedOnArrival: [] },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'rank', message: clash }])
    expect(
      await refusal(
        payload.update({
          collection: 'credentials',
          id: second.id,
          data: { rank: 1 },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'rank', message: clash }])

    // Saving a certification again keeps its own rank.
    const saved = await payload.update({
      collection: 'credentials',
      id: first.id,
      data: { rank: 1, name: 'Example Ground Control' },
      ...as(lead),
    })
    expect(saved.rank).toBe(1)
  })

  it('refuse a rank or arrival ratings on an endorsement', async () => {
    expect(
      await refusal(
        payload.create({
          collection: 'credentials',
          data: { ...endorsement, rank: 3, grantedOnArrival: ['S2'] },
          ...as(lead),
        }),
      ),
    ).toEqual([
      { path: 'rank', message: 'Only a certification has a rank. Clear it for an endorsement.' },
      {
        path: 'grantedOnArrival',
        message:
          'Only a certification is granted on arrival. Clear the ratings for an endorsement.',
      },
    ])
  })

  it('refuse turning a ranked certification into an endorsement', async () => {
    const existing = await payload.create({
      collection: 'credentials',
      data: certification,
      ...as(lead),
    })

    expect(
      await refusal(
        payload.update({
          collection: 'credentials',
          id: existing.id,
          data: { kind: 'endorsement' },
          ...as(lead),
        }),
      ),
    ).toEqual([
      { path: 'rank', message: 'Only a certification has a rank. Clear it for an endorsement.' },
      {
        path: 'grantedOnArrival',
        message:
          'Only a certification is granted on arrival. Clear the ratings for an endorsement.',
      },
    ])

    const turned = await payload.update({
      collection: 'credentials',
      id: existing.id,
      data: { kind: 'endorsement', rank: null, grantedOnArrival: [] },
      ...as(lead),
    })
    expect(turned).toMatchObject({ kind: 'endorsement', rank: null, grantedOnArrival: [] })
  })

  it('are granted on arrival for VATSIM controller ratings only', async () => {
    const saved = await payload.create({
      collection: 'credentials',
      data: { ...certification, grantedOnArrival: ['S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3'] },
      ...as(lead),
    })
    expect(saved.grantedOnArrival).toEqual(['S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3'])

    const errors = await refusal(
      payload.create({
        collection: 'credentials',
        // @ts-expect-error -- OBS is not a rating that grants anything
        data: { ...certification, code: 'X-RC', rank: 2, grantedOnArrival: ['OBS'] },
        ...as(lead),
      }),
    )
    expect(errors).toEqual([{ path: 'grantedOnArrival', message: expect.any(String) }])
  })
})

describe('the catalogue', () => {
  it('serves every credential, certifications by rank and then endorsements, retired ones too', async () => {
    const endorsed = await payload.create({
      collection: 'credentials',
      data: { ...endorsement, description: 'Tower at an example field.' },
    })
    const radar = await payload.create({
      collection: 'credentials',
      data: {
        code: 'X-RC',
        kind: 'certification',
        name: 'Example Radar',
        rank: 2,
        grantedOnArrival: ['C1', 'I1'],
        retired: true,
      },
    })
    const ground = await payload.create({ collection: 'credentials', data: certification })

    const { status, body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(status).toBe(200)
    expect(body.credentials).toEqual([
      {
        id: ground.id,
        code: 'X-GC',
        kind: 'certification',
        name: 'Example Ground',
        description: 'Ground control at an example field.',
        rank: 1,
        grantedOnArrival: ['S1'],
        retired: false,
      },
      {
        id: radar.id,
        code: 'X-RC',
        kind: 'certification',
        name: 'Example Radar',
        description: '',
        rank: 2,
        grantedOnArrival: ['C1', 'I1'],
        retired: true,
      },
      {
        id: endorsed.id,
        code: 'X-LC',
        kind: 'endorsement',
        name: 'Example Local',
        description: 'Tower at an example field.',
        rank: null,
        grantedOnArrival: [],
        retired: false,
      },
    ])
  })
})
