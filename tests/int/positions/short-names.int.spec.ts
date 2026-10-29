import { Forbidden, ValidationError, type Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Position, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from '../courseware/helpers'
import stored from './fixtures/vnas-zid.json'

let payload: Payload
let cmsAdmin: User

const account = (email: string, roles: User['roles'] = []) =>
  payload.create({ collection: 'users', data: { email, password: 'example-password', roles } })

const as = (user: User) => ({ user, overrideAccess: false })

/** A fresh copy of the stored vNAS response, to change for a test. */
const response = (): typeof stored => structuredClone(stored)

/** Syncs from this vNAS answer, as the CMS admin pressing "Sync from vNAS". */
async function sync(body: unknown) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(body))
  const { status } = await callEndpoint(payload, '/vnas/positions/sync', {
    method: 'post',
    token: null,
    user: cmsAdmin,
  })
  vi.restoreAllMocks()
  expect(status).toBe(200)
}

async function position(callsign: string): Promise<Position> {
  const { docs } = await payload.find({
    collection: 'positions',
    where: { callsign: { equals: callsign } },
    depth: 0,
  })
  return docs[0]
}

/** The catalogue's short name for each position, by callsign. */
async function servedInCatalogue(): Promise<Record<string, string | null>> {
  const { body } = await callEndpoint(payload, '/courseware/catalogue')
  return Object.fromEntries(
    body.positions.map((each: { callsign: string; shortName: string | null }) => [
      each.callsign,
      each.shortName,
    ]),
  )
}

const override = (user: User, callsign: string, value: string | null) =>
  position(callsign).then(({ id }) =>
    payload.update({
      collection: 'positions',
      id,
      data: { indyShortName: { override: value } },
      depth: 0,
      ...as(user),
    }),
  )

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) return error.data.errors.map((entry) => entry.message)
    throw error
  }
  throw new Error('Expected the save to be refused')
}

/**
 * The stored response with one more position of each kind it lacks, at Louisville: a ground,
 * a delivery, a ramp, a guard, a departure, an approach named for another airport (as
 * `DAY_M_APP` sits in the CMH TRACON) and an approach whose TCP vNAS doesn't list.
 */
function everyKind() {
  const body = response()
  const sdf = body.facility.childFacilities[0]
  sdf.starsConfiguration!.tcps.push(
    { subset: 1, sectorId: 'M', id: '01K2NF1CN2EXAMPLETCP00000M1' },
    { subset: 1, sectorId: 'X', id: '01K2NF1CN2EXAMPLETCP00000X1' },
  )
  const at = (callsign: string, id: string, name: string, radioName: string, tcpId?: string) => ({
    id,
    name,
    starred: false,
    radioName,
    callsign,
    frequency: 121900000,
    ...(tcpId ? { starsConfiguration: { areaId: 'EXAMPLEAREA', colorSet: 'Tcw', tcpId } } : {}),
  })
  const positions: unknown[] = sdf.positions
  positions.push(
    at('SDF_E_GND', '01EXAMPLEPOSITION000000GND', 'Ground Control East', 'Louisville Ground'),
    at('SDF_DEL', '01EXAMPLEPOSITION000000DEL', 'Clearance Delivery', 'Louisville Clearance'),
    at('SDF_RMP', '01EXAMPLEPOSITION000000RMP', 'Example Ramp Control', 'Louisville Ramp'),
    at('SDF_EM_TWR', '01EXAMPLEPOSITION00000EMTW', 'SDF GUARD', 'Louisville Tower'),
    at(
      'SDF_X_DEP',
      '01EXAMPLEPOSITION000000DEP',
      'Departure Radar 2',
      'Louisville Departure',
      '01K2NF1CN2EXAMPLETCP00000X1',
    ),
    at(
      'BWG_M_APP',
      '01EXAMPLEPOSITION0000BWGAP',
      'Example Radar',
      'Bowling Green Approach',
      '01K2NF1CN2EXAMPLETCP00000M1',
    ),
    at('SDF_Q_APP', '01EXAMPLEPOSITION000000APQ', 'Example Radar 2', 'Louisville Approach'),
    at('CVG_W_TWR', '01EXAMPLEPOSITION0000CVGWT', 'Local Control West', 'Cincinnati Tower'),
    at('CVG_W_GND', '01EXAMPLEPOSITION0000CVGWG', 'Ground Control West', 'Cincinnati Ground'),
    at('CVG_C_TWR', '01EXAMPLEPOSITION0000CVGCT', 'Local Control Center', 'Cincinnati Tower'),
  )
  return body
}

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  cmsAdmin = await account('cms-admin@example.com', ['cms:admin'])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generated short names', () => {
  it('are worked out by the sync from the callsign and, for radar, the STARS TCP', async () => {
    await sync(everyKind())

    expect(await servedInCatalogue()).toEqual({
      // vNAS's own, from the ERAM sector.
      IND_83_CTR: 'FLM 83',
      // Guard, TMU and ramp positions get nothing.
      IND_EM_CTR: null,
      ZID_TMU: null,
      SDF_EM_TWR: null,
      SDF_RMP: null,
      // Tower, ground and delivery: the callsign's prefix and LC, GC or CD.
      LOU_TWR: 'LOU LC',
      PKB_TWR: 'PKB LC',
      // An east or west position ends with it; another middle part does not.
      SDF_E_TWR: 'SDF LC E',
      SDF_E_GND: 'SDF GC E',
      CVG_W_TWR: 'CVG LC W',
      CVG_W_GND: 'CVG GC W',
      CVG_C_TWR: 'CVG LC',
      SDF_DEL: 'SDF CD',
      // Approach and departure: the prefix and the TCP's sector letter.
      SDF_D_APP: 'SDF D',
      SDF_X_DEP: 'SDF X',
      // The prefix is the callsign's, not the facility's.
      BWG_M_APP: 'BWG M',
      // No TCP to read a letter from.
      SDF_Q_APP: null,
    })
    expect(await position('SDF_D_APP')).toMatchObject({
      title: 'SDF D · Departure Radar 1',
      shortName: 'SDF D',
      vnasShortName: null,
      indyShortName: { generated: 'SDF D', override: null },
    })
    expect(await position('IND_83_CTR')).toMatchObject({
      title: 'FLM 83 · Falmouth 83',
      shortName: 'FLM 83',
      vnasShortName: 'FLM 83',
      indyShortName: { generated: null, override: null },
    })
    expect((await position('ZID_TMU')).title).toBe('ZID_TMU · ZID TMU')
  })

  it('are worked out again on every sync', async () => {
    await sync(response())
    const moved = response()
    moved.facility.childFacilities[0].starsConfiguration!.tcps[0].sectorId = 'E'
    await sync(moved)

    expect(await position('SDF_D_APP')).toMatchObject({
      shortName: 'SDF E',
      indyShortName: { generated: 'SDF E' },
    })
  })
})

describe('a short name override', () => {
  beforeEach(async () => {
    await sync(response())
  })

  it('is served in place of the generated value, and kept by the sync', async () => {
    await override(cmsAdmin, 'SDF_D_APP', 'SDF DR')
    const moved = response()
    moved.facility.childFacilities[0].starsConfiguration!.tcps[0].sectorId = 'E'
    await sync(moved)

    expect(await position('SDF_D_APP')).toMatchObject({
      title: 'SDF DR · Departure Radar 1',
      shortName: 'SDF DR',
      indyShortName: { generated: 'SDF E', override: 'SDF DR' },
    })
    expect((await servedInCatalogue()).SDF_D_APP).toBe('SDF DR')
  })

  it('falls back to the generated value when cleared', async () => {
    await override(cmsAdmin, 'SDF_E_TWR', 'SDF LE')
    await override(cmsAdmin, 'SDF_E_TWR', null)

    expect(await position('SDF_E_TWR')).toMatchObject({
      title: 'SDF LC E · Local Control East',
      shortName: 'SDF LC E',
      indyShortName: { generated: 'SDF LC E', override: null },
    })

    await override(cmsAdmin, 'SDF_E_TWR', 'SDF LE')
    await override(cmsAdmin, 'SDF_E_TWR', '  ')
    expect(await position('SDF_E_TWR')).toMatchObject({
      shortName: 'SDF LC E',
      indyShortName: { override: null },
    })
  })

  it('can name a position that has nothing generated', async () => {
    await override(cmsAdmin, 'ZID_TMU', 'ZID TM')

    expect((await position('ZID_TMU')).title).toBe('ZID TM · ZID TMU')
  })

  it('gives way to a short name vNAS publishes, and is kept', async () => {
    await override(cmsAdmin, 'ZID_TMU', 'ZID TM')
    const published = response()
    published.facility.positions[1].eramConfiguration.sectorId = '99'
    published.facility.eramConfiguration.sectors.push({
      id: '01EXAMPLESECTOR00000000099',
      sectorId: 99,
      name: 'ZID TMU',
      shortName: 'TMU 99',
      isFromEramData: true,
      isExcluded: false,
    })
    await sync(published)

    expect(await position('ZID_TMU')).toMatchObject({
      title: 'TMU 99 · ZID TMU',
      shortName: 'TMU 99',
      vnasShortName: 'TMU 99',
      indyShortName: { override: 'ZID TM' },
    })
    expect((await servedInCatalogue()).ZID_TMU).toBe('TMU 99')
  })

  it('is vNAS’s for a center sector whose id has a leading zero', async () => {
    // vNAS sends the position's sector id as the string "01" and the sector's as the number 1.
    const published = response()
    expect(published.facility.positions[1].eramConfiguration.sectorId).toBe('01')
    published.facility.eramConfiguration.sectors.push({
      id: '01EXAMPLESECTOR00000000001',
      sectorId: 1,
      name: 'ZID TMU',
      shortName: 'TMU 1',
      isFromEramData: true,
      isExcluded: false,
    })
    await sync(published)

    expect(await position('ZID_TMU')).toMatchObject({ shortName: 'TMU 1', vnasShortName: 'TMU 1' })
    expect((await servedInCatalogue()).ZID_TMU).toBe('TMU 1')
    // Sector "00" has no sector in the list, so its position still has none.
    expect((await servedInCatalogue()).IND_EM_CTR).toBeNull()
  })

  it('is refused where vNAS has a short name', async () => {
    expect(await refusal(override(cmsAdmin, 'IND_83_CTR', 'FLM 8'))).toEqual([
      'vNAS names this position FLM 83, so its short name can’t be overridden.',
    ])
    expect((await position('IND_83_CTR')).shortName).toBe('FLM 83')
  })
})

describe('who may override a short name', () => {
  beforeEach(async () => {
    await sync(response())
  })

  it.each([
    ['the Training Admin', ['training:admin']],
    ['a lead', ['training:lead']],
    ['an account with no role', []],
  ] as const)('refuses %s', async (_, roles) => {
    const user = await account('someone@example.com', [...roles])

    await expect(override(user, 'SDF_D_APP', 'SDF DR')).rejects.toThrow(Forbidden)
    expect((await position('SDF_D_APP')).shortName).toBe('SDF D')
  })

  it('lets the CMS admin change only the override, never what vNAS supplies or the sync works out', async () => {
    const before = await position('SDF_D_APP')

    await payload.update({
      collection: 'positions',
      id: before.id,
      data: {
        callsign: 'SDF_Z_APP',
        name: 'Renamed',
        frequency: 118000000,
        vnasShortName: 'SDF V',
        shortName: 'SDF S',
        title: 'Retitled',
        retired: true,
        indyShortName: { generated: 'SDF G', override: 'SDF DR' },
      },
      ...as(cmsAdmin),
    })

    expect(await position('SDF_D_APP')).toMatchObject({
      callsign: 'SDF_D_APP',
      name: 'Departure Radar 1',
      frequency: 132075000,
      vnasShortName: null,
      shortName: 'SDF DR',
      title: 'SDF DR · Departure Radar 1',
      retired: false,
      indyShortName: { generated: 'SDF D', override: 'SDF DR' },
    })
  })
})
