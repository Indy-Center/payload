import { Forbidden, ValidationError, type Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CREDENTIALS } from '@/migrations/20261026_030346_credentials'
import type { Position, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from '../courseware/helpers'
import stored from './fixtures/vnas-zid.json'

let payload: Payload
let cmsAdmin: User
let idOf: Record<string, string>

const account = (email: string, roles: User['roles'] = []) =>
  payload.create({ collection: 'users', data: { email, password: 'example-password', roles } })

const as = (user: User) => ({ user, overrideAccess: false })

/** Creates the credentials Indy issues, less any named. */
async function makeCredentials(without: string[] = []) {
  for (const credential of CREDENTIALS.filter(({ code }) => !without.includes(code))) {
    const { id } = await payload.create({
      collection: 'credentials',
      data: { ...credential, grantedOnArrival: [] } as never,
    })
    idOf[credential.code] = id
  }
}

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

/** The stored response with one more position of each type it lacks, at Louisville. */
function everyType() {
  const body = structuredClone(stored)
  const positions: unknown[] = body.facility.childFacilities[0].positions
  const at = (callsign: string, id: string) => ({
    id,
    name: callsign,
    starred: false,
    radioName: 'Example',
    callsign,
    frequency: 121900000,
  })
  positions.push(
    at('SDF_E_GND', '01EXAMPLEPOSITION000000GND'),
    at('SDF_DEL', '01EXAMPLEPOSITION000000DEL'),
    at('SDF_RMP', '01EXAMPLEPOSITION000000RMP'),
    at('SDF_EM_TWR', '01EXAMPLEPOSITION00000EMTW'),
    at('SDF_X_DEP', '01EXAMPLEPOSITION000000DEP'),
  )
  return body
}

async function position(callsign: string): Promise<Position> {
  const { docs } = await payload.find({
    collection: 'positions',
    where: { callsign: { equals: callsign } },
    depth: 0,
  })
  return docs[0]
}

/** A position's stored rows as lists of credential codes. */
const codes = (rows: { anyOf?: (string | { id: string })[] | null }[] | null | undefined) => {
  const byId = Object.fromEntries(Object.entries(idOf).map(([code, id]) => [id, code]))
  return (rows ?? []).map((row) =>
    (row.anyOf ?? []).map((credential) =>
      typeof credential === 'string' ? byId[credential] : credential.id,
    ),
  )
}

const generated = async (callsign: string) =>
  codes((await position(callsign)).indyRequiredCredentials?.generated)

/** Leaves the generated list as it was before the rule gave the position one (below access). */
const staleGenerated = async (callsign: string) =>
  payload.update({
    collection: 'positions',
    id: (await position(callsign)).id,
    data: { indyRequiredCredentials: { generated: [] } },
    depth: 0,
  })

const override = (user: User, callsign: string, rows: string[][] | null) =>
  position(callsign).then(({ id }) =>
    payload.update({
      collection: 'positions',
      id,
      data: {
        indyRequiredCredentials: {
          override: rows && rows.map((row) => ({ anyOf: row.map((code) => idOf[code]) })),
        },
      },
      depth: 0,
      ...as(user),
    }),
  )

/** The catalogue's required credentials for each position, by callsign. */
async function servedInCatalogue(): Promise<Record<string, { anyOf: string[] }[]>> {
  const { body } = await callEndpoint(payload, '/courseware/catalogue')
  return Object.fromEntries(
    body.positions.map((each: { callsign: string; requiredCredentials: { anyOf: string[] }[] }) => [
      each.callsign,
      each.requiredCredentials,
    ]),
  )
}

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  idOf = {}
  cmsAdmin = await account('cms-admin@example.com', ['cms:admin'])
  await makeCredentials()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generated required credentials', () => {
  it('are worked out by the sync from the position type', async () => {
    await sync(everyType())

    expect({
      SDF_RMP: await generated('SDF_RMP'),
      SDF_DEL: await generated('SDF_DEL'),
      SDF_E_GND: await generated('SDF_E_GND'),
      SDF_E_TWR: await generated('SDF_E_TWR'),
      SDF_D_APP: await generated('SDF_D_APP'),
      SDF_X_DEP: await generated('SDF_X_DEP'),
      IND_83_CTR: await generated('IND_83_CTR'),
      ZID_TMU: await generated('ZID_TMU'),
      IND_EM_CTR: await generated('IND_EM_CTR'),
      SDF_EM_TWR: await generated('SDF_EM_TWR'),
    }).toEqual({
      SDF_RMP: [['S-GC']],
      SDF_DEL: [['S-GC']],
      SDF_E_GND: [['A-GC']],
      SDF_E_TWR: [['A-LC']],
      SDF_D_APP: [['T-RC']],
      SDF_X_DEP: [['T-RC']],
      // Two rows, both to be met.
      IND_83_CTR: [['E-RC'], ['T2-CTR']],
      ZID_TMU: [],
      // A guard position needs nothing, whatever its type.
      IND_EM_CTR: [],
      SDF_EM_TWR: [],
    })
  })

  it('are worked out again when the credentials change, and stored on no rating', async () => {
    await resetDatabase(payload)
    cmsAdmin = await account('cms-admin@example.com', ['cms:admin'])
    await sync(stored)
    expect(await generated('SDF_E_TWR')).toEqual([])

    await makeCredentials()
    await sync(stored)

    expect(await generated('SDF_E_TWR')).toEqual([['A-LC']])
    expect(Object.keys(await position('SDF_E_TWR'))).not.toContain('rating')
  })

  it('leave a default empty when its credential is missing, log it, and go on', async () => {
    await resetDatabase(payload)
    cmsAdmin = await account('cms-admin@example.com', ['cms:admin'])
    await makeCredentials(['A-LC', 'T2-CTR'])
    const warn = vi.spyOn(payload.logger, 'warn')

    await sync(stored)

    expect(await generated('SDF_E_TWR')).toEqual([])
    // The row for the missing credential goes; the centre's other row stands.
    expect(await generated('IND_83_CTR')).toEqual([['E-RC']])
    expect(await generated('SDF_D_APP')).toEqual([['T-RC']])
    const said = warn.mock.calls.map(([message]) => String(message)).join('\n')
    expect(said).toContain('A-LC')
    expect(said).toContain('T2-CTR')
    expect(said).not.toContain('E-RC')
  })
})

describe('a required credentials override', () => {
  beforeEach(async () => {
    await sync(everyType())
  })

  it('replaces the whole list, is kept by the sync, and is served', async () => {
    await override(cmsAdmin, 'SDF_E_GND', [['S-GC', 'A-GC']])
    // The stored generated list is out of date, so the sync changes it.
    await staleGenerated('SDF_E_GND')
    expect(await generated('SDF_E_GND')).toEqual([])

    await sync(everyType())

    expect(await generated('SDF_E_GND')).toEqual([['A-GC']])
    expect(codes((await position('SDF_E_GND')).indyRequiredCredentials?.override)).toEqual([
      ['S-GC', 'A-GC'],
    ])
    expect((await servedInCatalogue()).SDF_E_GND).toEqual([{ anyOf: ['S-GC', 'A-GC'] }])
  })

  it('is served in place of the generated list, then falls back when cleared', async () => {
    await override(cmsAdmin, 'SDF_E_GND', [['S-GC']])
    expect((await servedInCatalogue()).SDF_E_GND).toEqual([{ anyOf: ['S-GC'] }])

    await override(cmsAdmin, 'SDF_E_GND', null)

    expect((await position('SDF_E_GND')).indyRequiredCredentials?.override ?? []).toEqual([])
    expect((await servedInCatalogue()).SDF_E_GND).toEqual([{ anyOf: ['A-GC'] }])
  })

  it('can name an endorsement beside a certification in one row', async () => {
    await override(cmsAdmin, 'SDF_E_TWR', [['S-LC', 'A-LC']])

    expect((await servedInCatalogue()).SDF_E_TWR).toEqual([{ anyOf: ['S-LC', 'A-LC'] }])
  })

  it('leaves out retired credentials, as a course’s prerequisites do, unless already named', async () => {
    await override(cmsAdmin, 'SDF_E_TWR', [['S-LC']])
    for (const code of ['S-LC', 'A-GC'])
      await payload.update({ collection: 'credentials', id: idOf[code], data: { retired: true } })

    // The retired credential already in the override stays, beside a live one.
    await override(cmsAdmin, 'SDF_E_TWR', [['S-LC', 'A-LC']])
    expect(codes((await position('SDF_E_TWR')).indyRequiredCredentials?.override)).toEqual([
      ['S-LC', 'A-LC'],
    ])

    // One that is not already named is refused, in a new row or beside others.
    const paths = async (rows: string[][]) => {
      try {
        await override(cmsAdmin, 'SDF_E_TWR', rows)
      } catch (error) {
        if (error instanceof ValidationError) return error.data.errors.map(({ path }) => path)
        throw error
      }
      return []
    }
    expect(await paths([['S-LC'], ['A-GC']])).toEqual(['indyRequiredCredentials.override.1.anyOf'])
    expect(await paths([['A-LC', 'A-GC']])).toEqual(['indyRequiredCredentials.override.0.anyOf'])
    expect(codes((await position('SDF_E_TWR')).indyRequiredCredentials?.override)).toEqual([
      ['S-LC', 'A-LC'],
    ])

    // An empty override is none: the generated list is served.
    await override(cmsAdmin, 'SDF_E_TWR', null)
    expect((await servedInCatalogue()).SDF_E_TWR).toEqual([{ anyOf: ['A-LC'] }])
  })

  it('does not hold the sync’s generated list to it', async () => {
    await payload.update({ collection: 'credentials', id: idOf['A-GC'], data: { retired: true } })
    await staleGenerated('SDF_E_GND')

    await sync(everyType())

    expect(await generated('SDF_E_GND')).toEqual([['A-GC']])
  })
})

describe('who may override required credentials', () => {
  it.each([
    ['the Training Admin', ['training:admin']],
    ['a lead', ['training:lead']],
    ['an account with no role', []],
  ] as const)('refuses %s', async (_, roles) => {
    await sync(stored)
    const user = await account('someone@example.com', [...roles])

    await expect(override(user, 'SDF_E_TWR', [['S-LC']])).rejects.toThrow(Forbidden)
    expect((await position('SDF_E_TWR')).indyRequiredCredentials?.override ?? []).toEqual([])
  })

  it('lets the CMS admin, and the generated list is theirs to read only', async () => {
    await sync(stored)
    const { id } = await position('SDF_E_TWR')

    await payload.update({
      collection: 'positions',
      id,
      data: {
        indyRequiredCredentials: {
          generated: [{ anyOf: [idOf['S-GC']] }],
          override: [{ anyOf: [idOf['S-LC']] }],
        },
      },
      ...as(cmsAdmin),
    })

    expect(await generated('SDF_E_TWR')).toEqual([['A-LC']])
    expect(codes((await position('SDF_E_TWR')).indyRequiredCredentials?.override)).toEqual([
      ['S-LC'],
    ])
  })
})

describe("the catalogue's required credentials", () => {
  it('are rows of credential codes on each position, retired positions included', async () => {
    await sync(everyType())
    await override(cmsAdmin, 'SDF_E_GND', [['S-GC', 'A-GC']])

    const served = await servedInCatalogue()

    expect(served).toMatchObject({
      SDF_E_GND: [{ anyOf: ['S-GC', 'A-GC'] }],
      SDF_E_TWR: [{ anyOf: ['A-LC'] }],
      IND_83_CTR: [{ anyOf: ['E-RC'] }, { anyOf: ['T2-CTR'] }],
      ZID_TMU: [],
      SDF_EM_TWR: [],
    })
  })
})
