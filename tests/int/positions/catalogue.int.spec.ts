import type { Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from '../courseware/helpers'
import stored from './fixtures/vnas-zid.json'

let payload: Payload
let cmsAdmin: User

beforeAll(async () => {
  payload = await testPayload()
})

const sync = async (body: unknown) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(body))
  await callEndpoint(payload, '/vnas/positions/sync', {
    method: 'post',
    token: null,
    user: cmsAdmin,
  })
  vi.restoreAllMocks()
}

beforeEach(async () => {
  await resetDatabase(payload)
  cmsAdmin = await payload.create({
    collection: 'users',
    data: { email: 'cms-admin@example.com', password: 'example-password', roles: ['cms:admin'] },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the catalogue's positions", () => {
  it('lists every position by callsign, retired ones included, with the vNAS id as its id', async () => {
    await sync(stored)
    const dropped = structuredClone(stored)
    dropped.facility.childFacilities.splice(1, 1)
    await sync(dropped)

    const { status, body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(status).toBe(200)
    expect(body.positions.map((position: { callsign: string }) => position.callsign)).toEqual([
      'IND_83_CTR',
      'IND_EM_CTR',
      'LOU_TWR',
      'PKB_TWR',
      'SDF_D_APP',
      'SDF_E_TWR',
      'ZID_TMU',
    ])
    expect(body.positions[0]).toEqual({
      id: '01GFTXMTZDDJ9XKMJ7AX0EXKQF',
      callsign: 'IND_83_CTR',
      name: 'Falmouth 83',
      shortName: 'FLM 83',
      radioName: 'Indy Center',
      frequency: 128225000,
      facility: { id: 'ZID', name: 'Indianapolis ARTCC' },
      starred: true,
      retired: false,
    })
    expect(body.positions[3]).toEqual({
      id: '01GMQCS4DB3KJV12D2KM83CWTV',
      callsign: 'PKB_TWR',
      name: 'Local Control',
      shortName: 'PKB LC',
      radioName: 'Parkersburg Tower',
      frequency: 123700000,
      facility: { id: 'PKB', name: 'Parkersburg ATCT' },
      starred: true,
      retired: true,
    })
  })

  it('is an empty list before the first sync', async () => {
    const { body } = await callEndpoint(payload, '/courseware/catalogue')

    expect(body.positions).toEqual([])
  })
})
