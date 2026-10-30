import { Forbidden, type Payload } from 'payload'
import { createLocalReq } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Position, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from '../courseware/helpers'
import stored from './fixtures/vnas-zid.json'

let payload: Payload
let cmsAdmin: User
let trainingAdmin: User
let lead: User
let member: User
let position: Position

const account = (email: string, roles: User['roles'] = []) =>
  payload.create({ collection: 'users', data: { email, password: 'example-password', roles } })

const as = (user: User) => ({ user, overrideAccess: false })

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  cmsAdmin = await account('cms-admin@example.com', ['cms:admin'])
  trainingAdmin = await account('training-admin@example.com', ['training:admin'])
  lead = await account('lead@example.com', ['training:lead'])
  member = await account('member@example.com')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(stored))
  await callEndpoint(payload, '/vnas/positions/sync', {
    method: 'post',
    token: null,
    user: cmsAdmin,
  })
  position = (await payload.find({ collection: 'positions', limit: 1, depth: 0 })).docs[0]
  vi.mocked(fetch).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('who may sync from vNAS', () => {
  it.each([
    ['the Training Admin', () => trainingAdmin],
    ['a lead', () => lead],
    ['an account with no role', () => member],
  ])('refuses %s, without calling vNAS', async (_, who) => {
    const { status, body } = await callEndpoint(payload, '/vnas/positions/sync', {
      method: 'post',
      token: null,
      user: who(),
    })

    expect(status).toBe(403)
    expect(body).toEqual({
      errors: [{ message: 'Only a CMS admin may sync positions from vNAS.' }],
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a request with nobody signed in', async () => {
    const { status } = await callEndpoint(payload, '/vnas/positions/sync', {
      method: 'post',
      token: null,
    })

    expect(status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("lets only the CMS admin queue, run or cancel jobs through Payload's jobs API", async () => {
    const { access } = payload.config.jobs
    for (const user of [cmsAdmin, trainingAdmin, lead, member, null]) {
      const req = await createLocalReq(
        { user: user ? { ...user, collection: 'users' } : undefined },
        payload,
      )
      const allowed = user === cmsAdmin
      expect(await access!.queue!({ req })).toBe(allowed)
      expect(await access!.run!({ req })).toBe(allowed)
      expect(await access!.cancel!({ req })).toBe(allowed)
    }
  })
})

describe('positions by hand', () => {
  it('are read by every CMS account', async () => {
    for (const user of [cmsAdmin, trainingAdmin, lead, member]) {
      const { docs } = await payload.find({ collection: 'positions', ...as(user) })
      expect(docs).toHaveLength(7)
    }
  })

  // The CMS admin may save a position, but only its overrides change (short-names.int.spec.ts).
  it.each([
    ['the CMS admin', () => cmsAdmin, false],
    ['the Training Admin', () => trainingAdmin, true],
    ['a lead', () => lead, true],
    ['an account with no role', () => member, true],
  ])('are never created, deleted or changed from vNAS by %s', async (_, who, refusedEdit) => {
    const user = who()
    await expect(
      payload.create({
        collection: 'positions',
        data: { ...position, id: undefined, vnasId: 'X', callsign: 'XYZ_TWR' },
        ...as(user),
      }),
    ).rejects.toThrow(Forbidden)
    const edit = payload.update({
      collection: 'positions',
      id: position.id,
      data: { name: 'Renamed' },
      ...as(user),
    })
    if (refusedEdit) await expect(edit).rejects.toThrow(Forbidden)
    else await edit
    await expect(
      payload.delete({ collection: 'positions', id: position.id, ...as(user) }),
    ).rejects.toThrow(Forbidden)
    expect((await payload.findByID({ collection: 'positions', id: position.id })).name).toBe(
      position.name,
    )
  })
})
