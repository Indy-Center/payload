import type { Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/payload-types'
import { callEndpoint, endpointResponse, resetDatabase, testPayload } from '../courseware/helpers'
import stored from '../positions/fixtures/vnas-zid.json'

/**
 * `GET /api/public/v1/positions` (payload decision 0005), read anonymously as the public reach it:
 * no signed-in user and no token. Positions come from the sync, over the stored vNAS answer.
 */

let payload: Payload
let cmsAdmin: User
let credentialIds: Map<string, string>

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
  // Made-up credentials under the codes the required-credentials rule names.
  credentialIds = new Map()
  for (const code of ['S-GC', 'A-LC', 'E-RC', 'T2-CTR']) {
    const credential = await payload.create({
      collection: 'credentials',
      data: { code, kind: 'endorsement', name: `Example ${code}` },
    })
    credentialIds.set(code, credential.id)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const readPositions = async () => {
  const response = await endpointResponse(payload, '/public/v1/positions', { token: null })
  return { status: response.status, headers: response.headers, body: await response.json() }
}

type Served = { callsign: string }
const byCallsign = (body: Served[], callsign: string) =>
  body.find((position) => position.callsign === callsign)

describe('the public positions', () => {
  it("serves a ZID position, a TRACON's and a satellite tower's, each with its facility's parent and nothing stored", async () => {
    await sync(stored)

    const { status, body } = await readPositions()

    expect(status).toBe(200)
    expect(byCallsign(body, 'IND_83_CTR')).toEqual({
      id: '01GFTXMTZDDJ9XKMJ7AX0EXKQF',
      callsign: 'IND_83_CTR',
      name: 'Falmouth 83',
      shortName: 'FLM 83',
      radioName: 'Indy Center',
      frequency: 128225000,
      facility: { id: 'ZID', name: 'Indianapolis ARTCC', parent: null },
      starred: true,
      requiredCredentials: [{ anyOf: ['E-RC'] }, { anyOf: ['T2-CTR'] }],
      retired: false,
    })
    expect(byCallsign(body, 'SDF_E_TWR')).toEqual({
      id: '01GRSY0X97QHN3PF6FQ9ZFGPYE',
      callsign: 'SDF_E_TWR',
      name: 'Local Control East',
      shortName: 'SDF LC E',
      radioName: 'Louisville Tower',
      frequency: 124200000,
      facility: {
        id: 'SDF',
        name: 'Louisville ATCT/TRACON',
        parent: { id: 'ZID', name: 'Indianapolis ARTCC' },
      },
      starred: true,
      requiredCredentials: [{ anyOf: ['A-LC'] }],
      retired: false,
    })
    expect(byCallsign(body, 'LOU_TWR')).toEqual({
      id: '01GRVKE3K4X2FEBXGSMW9XSD6M',
      callsign: 'LOU_TWR',
      name: 'Local Control',
      shortName: 'LOU LC',
      radioName: 'Bowman Tower',
      frequency: 119500000,
      facility: {
        id: 'LOU',
        name: 'Bowman ATCT',
        parent: { id: 'SDF', name: 'Louisville ATCT/TRACON' },
      },
      starred: true,
      requiredCredentials: [{ anyOf: ['A-LC'] }],
      retired: false,
    })
  })

  it('lists every position by callsign, a retired one flagged, with overrides served', async () => {
    await sync(stored)
    const dropped = structuredClone(stored)
    dropped.facility.childFacilities.splice(1, 1)
    await sync(dropped)
    const { docs } = await payload.find({
      collection: 'positions',
      where: { callsign: { equals: 'SDF_D_APP' } },
      depth: 0,
    })
    await payload.update({
      collection: 'positions',
      id: docs[0].id,
      data: {
        indyShortName: { override: 'SDF DR' },
        indyRequiredCredentials: {
          override: [{ anyOf: [credentialIds.get('S-GC')!, credentialIds.get('A-LC')!] }],
        },
      },
      depth: 0,
    })

    const { body } = await readPositions()

    expect(body.map((position: Served) => position.callsign)).toEqual([
      'IND_83_CTR',
      'IND_EM_CTR',
      'LOU_TWR',
      'PKB_TWR',
      'SDF_D_APP',
      'SDF_E_TWR',
      'ZID_TMU',
    ])
    expect(byCallsign(body, 'PKB_TWR')).toMatchObject({
      facility: {
        id: 'PKB',
        name: 'Parkersburg ATCT',
        parent: { id: 'ZID', name: 'Indianapolis ARTCC' },
      },
      retired: true,
    })
    expect(byCallsign(body, 'SDF_D_APP')).toMatchObject({
      shortName: 'SDF DR',
      requiredCredentials: [{ anyOf: ['S-GC', 'A-LC'] }],
      retired: false,
    })
  })

  it('is an empty list before the first sync', async () => {
    const { status, body } = await readPositions()

    expect(status).toBe(200)
    expect(body).toEqual([])
  })

  it('is public, cached five minutes, and sends no Vary or CORS headers', async () => {
    const { headers } = await readPositions()

    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('cache-control')).toBe('public, max-age=300')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('vary')).toBeNull()
    expect([...headers.keys()].filter((key) => key.startsWith('access-control-'))).toEqual([])
  })

  it("serves the same positions as the catalogue, so the two can't drift", async () => {
    await sync(stored)
    const dropped = structuredClone(stored)
    dropped.facility.childFacilities.splice(1, 1)
    await sync(dropped)

    const { body } = await readPositions()
    const catalogue = await callEndpoint(payload, '/courseware/catalogue')

    expect(body).toHaveLength(7)
    expect(catalogue.body.positions).toEqual(body)
  })
})
