import type { Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Position, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from '../courseware/helpers'
import stored from './fixtures/vnas-zid.json'

const VNAS_URL = 'https://data-api.vnas.vatsim.net/api/artccs/ZID'

let payload: Payload
let cmsAdmin: User

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, roles: User['roles'] = []): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', roles },
  })
}

/** A fresh copy of the stored vNAS response, to change for a test. */
const response = (): typeof stored => structuredClone(stored)

/** vNAS answers each request with this, as a fetch would; no test reaches vNAS itself. */
function vnasAnswers(answer: () => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input) !== VNAS_URL) throw new Error(`Unexpected fetch of ${String(input)}`)
    return answer()
  })
}
const vnasReturns = (body: unknown) => vnasAnswers(() => Response.json(body))

/** The Positions list's "Sync from vNAS", pressed by this account. */
const pressSync = (user: User) =>
  callEndpoint(payload, '/vnas/positions/sync', { method: 'post', token: null, user })

async function positions(): Promise<Position[]> {
  const { docs } = await payload.find({
    collection: 'positions',
    sort: 'callsign',
    pagination: false,
    depth: 0,
  })
  return docs
}
const byCallsign = async (callsign: string) =>
  (await positions()).find((position) => position.callsign === callsign)

beforeEach(async () => {
  await resetDatabase(payload)
  cmsAdmin = await account('cms-admin@example.com', ['cms:admin'])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('syncing positions from vNAS', () => {
  it('copies every position in the facility tree into an empty list', async () => {
    vnasReturns(response())

    const { status, body } = await pressSync(cmsAdmin)

    expect(status).toBe(200)
    expect(body).toEqual({ added: 7, changed: 0, retired: 0 })
    expect((await positions()).map((position) => position.callsign)).toEqual([
      'IND_83_CTR',
      'IND_EM_CTR',
      'LOU_TWR',
      'PKB_TWR',
      'SDF_D_APP',
      'SDF_E_TWR',
      'ZID_TMU',
    ])
  })

  it("copies what vNAS says of a position, a center's short name from its ERAM sector", async () => {
    vnasReturns(response())
    await pressSync(cmsAdmin)

    expect(await byCallsign('IND_83_CTR')).toMatchObject({
      vnasId: '01GFTXMTZDDJ9XKMJ7AX0EXKQF',
      title: 'FLM 83 · Falmouth 83',
      name: 'Falmouth 83',
      shortName: 'FLM 83',
      radioName: 'Indy Center',
      frequency: 128225000,
      facilityId: 'ZID',
      facilityName: 'Indianapolis ARTCC',
      starred: true,
      retired: false,
    })
    // A tower two levels down, under its TRACON, belongs to its own facility.
    expect(await byCallsign('LOU_TWR')).toMatchObject({
      title: 'LOU_TWR · Local Control',
      shortName: null,
      facilityId: 'LOU',
      facilityName: 'Bowman ATCT',
    })
    // A center position whose sector has no short name gets none.
    expect(await byCallsign('ZID_TMU')).toMatchObject({
      title: 'ZID_TMU · ZID TMU',
      shortName: null,
      starred: false,
    })
  })

  it('updates a position vNAS has changed, matched on its vNAS id, and leaves the rest', async () => {
    vnasReturns(response())
    await pressSync(cmsAdmin)
    vi.restoreAllMocks()

    const changed = response()
    const pkb = changed.facility.childFacilities[1].positions[0]
    pkb.callsign = 'PKB_N_TWR'
    pkb.frequency = 118725000
    // vNAS's radio names sometimes carry doubled or trailing spaces.
    pkb.radioName = 'Parkersburg  Tower '
    vnasReturns(changed)

    const { status, body } = await pressSync(cmsAdmin)

    expect(status).toBe(200)
    expect(body).toEqual({ added: 0, changed: 1, retired: 0 })
    expect(await byCallsign('PKB_TWR')).toBeUndefined()
    expect(await byCallsign('PKB_N_TWR')).toMatchObject({
      vnasId: '01GMQCS4DB3KJV12D2KM83CWTV',
      title: 'PKB_N_TWR · Local Control',
      frequency: 118725000,
      radioName: 'Parkersburg Tower',
    })
    expect(await positions()).toHaveLength(7)
  })

  it('follows two positions vNAS has swapped callsigns between, and a new one taking a freed callsign', async () => {
    vnasReturns(response())
    await pressSync(cmsAdmin)
    vi.restoreAllMocks()

    const swapped = response()
    const [departure, east] = swapped.facility.childFacilities[0].positions
    departure.callsign = 'SDF_E_TWR'
    east.callsign = 'SDF_D_APP'
    const pkb = swapped.facility.childFacilities[1].positions[0]
    pkb.callsign = 'PKB_N_TWR'
    const positionsAtPkb: unknown[] = swapped.facility.childFacilities[1].positions
    positionsAtPkb.push({
      ...pkb,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      callsign: 'PKB_TWR',
      name: 'Local Control South',
    })
    vnasReturns(swapped)

    const { status, body } = await pressSync(cmsAdmin)

    expect(status).toBe(200)
    expect(body).toEqual({ added: 1, changed: 3, retired: 0 })
    expect(await byCallsign('SDF_E_TWR')).toMatchObject({ vnasId: departure.id })
    expect(await byCallsign('SDF_D_APP')).toMatchObject({ vnasId: east.id })
    expect(await byCallsign('PKB_TWR')).toMatchObject({
      vnasId: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      title: 'PKB_TWR · Local Control South',
    })
  })

  it('reports nothing when vNAS is as it was', async () => {
    vnasReturns(response())
    await pressSync(cmsAdmin)

    expect((await pressSync(cmsAdmin)).body).toEqual({ added: 0, changed: 0, retired: 0 })
  })

  it('retires a position vNAS no longer lists, and un-retires it when vNAS lists it again', async () => {
    vnasReturns(response())
    await pressSync(cmsAdmin)
    vi.restoreAllMocks()

    const dropped = response()
    dropped.facility.childFacilities.splice(1, 1)
    vnasReturns(dropped)
    expect((await pressSync(cmsAdmin)).body).toEqual({ added: 0, changed: 0, retired: 1 })
    expect(await byCallsign('PKB_TWR')).toMatchObject({ retired: true, name: 'Local Control' })
    // Retiring again is not a change.
    expect((await pressSync(cmsAdmin)).body).toEqual({ added: 0, changed: 0, retired: 0 })
    vi.restoreAllMocks()

    vnasReturns(response())
    expect((await pressSync(cmsAdmin)).body).toEqual({ added: 0, changed: 1, retired: 0 })
    expect(await byCallsign('PKB_TWR')).toMatchObject({ retired: false })
    expect(await positions()).toHaveLength(7)
  })

  describe('a callsign vNAS gives to a new id (a position deleted and made again in Data Admin)', () => {
    const NEW_ID = '01HZZZZZZZZZZZZZZZZZZZZZZZ'
    /** The stored response with PKB_TWR under a new vNAS id and a new frequency. */
    const remade = () => {
      const answer = response()
      const pkb = answer.facility.childFacilities[1].positions[0]
      pkb.id = NEW_ID
      pkb.frequency = 118725000
      return answer
    }

    it('keeps the record that held the callsign, now under the new id', async () => {
      vnasReturns(response())
      await pressSync(cmsAdmin)
      const before = await byCallsign('PKB_TWR')
      vi.restoreAllMocks()
      vnasReturns(remade())

      const { status, body } = await pressSync(cmsAdmin)

      expect(status).toBe(200)
      expect(body).toEqual({ added: 0, changed: 1, retired: 0 })
      expect(await byCallsign('PKB_TWR')).toMatchObject({
        id: before!.id,
        vnasId: NEW_ID,
        frequency: 118725000,
        retired: false,
      })
      expect(await positions()).toHaveLength(7)
    })

    it('un-retires a retired record that held the callsign, under the new id', async () => {
      vnasReturns(response())
      await pressSync(cmsAdmin)
      const before = await byCallsign('PKB_TWR')
      vi.restoreAllMocks()
      const dropped = response()
      dropped.facility.childFacilities.splice(1, 1)
      vnasReturns(dropped)
      await pressSync(cmsAdmin)
      vi.restoreAllMocks()
      vnasReturns(remade())

      const { body } = await pressSync(cmsAdmin)

      expect(body).toEqual({ added: 0, changed: 1, retired: 0 })
      expect(await byCallsign('PKB_TWR')).toMatchObject({
        id: before!.id,
        vnasId: NEW_ID,
        retired: false,
      })
      expect(await positions()).toHaveLength(7)
    })

    it('leaves a record vNAS still lists under its own id to that id', async () => {
      vnasReturns(response())
      await pressSync(cmsAdmin)
      vi.restoreAllMocks()
      // SDF_E_TWR's old id is renamed and its callsign goes to a new id, in one answer.
      const answer = response()
      const [, east] = answer.facility.childFacilities[0].positions
      east.callsign = 'SDF_W_TWR'
      const positionsAtSdf: unknown[] = answer.facility.childFacilities[0].positions
      positionsAtSdf.push({ ...east, id: NEW_ID, callsign: 'SDF_E_TWR', name: 'Local Control' })
      vnasReturns(answer)

      const { body } = await pressSync(cmsAdmin)

      expect(body).toEqual({ added: 1, changed: 1, retired: 0 })
      expect(await byCallsign('SDF_W_TWR')).toMatchObject({ vnasId: east.id })
      expect(await byCallsign('SDF_E_TWR')).toMatchObject({ vnasId: NEW_ID, name: 'Local Control' })
    })
  })
})

describe('the daily sync', () => {
  it("is scheduled once a day on Payload's jobs queue, and syncs as the button does", async () => {
    const task = payload.config.jobs.tasks!.find(({ slug }) => slug === 'syncPositions')!
    expect(task.schedule).toEqual([{ cron: '0 0 9 * * *', queue: 'daily' }])
    const autoRun = payload.config.jobs.autoRun as { queue: string }[]
    expect(autoRun.map(({ queue }) => queue)).toContain('daily')

    vnasReturns(response())
    const job = await payload.jobs.queue({ task: 'syncPositions', input: {}, queue: 'daily' })
    const { jobStatus } = await payload.jobs.run({ queue: 'daily' })

    expect(jobStatus?.[job.id]?.status).toBe('success')
    expect(await positions()).toHaveLength(7)
  })

  it('fails the job and leaves the list as it was when vNAS cannot be reached', async () => {
    vnasAnswers(() => new Response('Unavailable', { status: 503 }))
    const job = await payload.jobs.queue({ task: 'syncPositions', input: {}, queue: 'daily' })
    const { jobStatus } = await payload.jobs.run({ queue: 'daily' })

    expect(jobStatus?.[job.id]?.status).toBe('error-reached-max-retries')
    expect(await positions()).toEqual([])
  })
})

describe('a sync that fails', () => {
  /** Synced once from the stored response, then vNAS answers with `answer`. */
  async function syncedThen(answer: () => Response | Promise<Response>) {
    vnasReturns(response())
    await pressSync(cmsAdmin)
    vi.restoreAllMocks()
    const before = await positions()
    vnasAnswers(answer)
    const error = vi.spyOn(payload.logger, 'error')
    return { before, error }
  }

  it('leaves the list as it was and logs why when vNAS cannot be reached', async () => {
    const { before, error } = await syncedThen(() => {
      throw new TypeError('fetch failed')
    })

    const { status, body } = await pressSync(cmsAdmin)

    expect(status).toBe(502)
    expect(body.errors[0].message).toBe(
      'vNAS could not be reached: fetch failed Nothing was changed.',
    )
    expect(await positions()).toEqual(before)
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Positions sync from vNAS failed; nothing changed.',
    )
  })

  it('leaves the list as it was when vNAS answers with an error status', async () => {
    const { before } = await syncedThen(() => new Response('Bad gateway', { status: 503 }))

    const { status, body } = await pressSync(cmsAdmin)

    expect(status).toBe(502)
    expect(body.errors[0].message).toBe('vNAS answered 503. Nothing was changed.')
    expect(await positions()).toEqual(before)
  })

  it.each([
    [
      'not JSON',
      () => new Response('<html>', { status: 200 }),
      'vNAS answered with something that is not JSON.',
    ],
    ['no facility', () => Response.json({ id: 'ZID' }), 'vNAS answered unexpectedly: no facility.'],
    [
      'no positions anywhere',
      () => {
        const empty = response()
        empty.facility.positions = []
        empty.facility.childFacilities = []
        return Response.json(empty)
      },
      'vNAS answered unexpectedly: no positions.',
    ],
    [
      'a position with a blank radio name',
      () => {
        const blank = response()
        blank.facility.childFacilities[1].positions[0].radioName = '  '
        return Response.json(blank)
      },
      'vNAS answered unexpectedly: a position at PKB is missing its id, callsign, name, radio name or frequency.',
    ],
    [
      'a position with no frequency, below positions that are fine',
      () => {
        const broken = response()
        delete (broken.facility.childFacilities[1].positions[0] as { frequency?: number }).frequency
        return Response.json(broken)
      },
      'vNAS answered unexpectedly: a position at PKB is missing its id, callsign, name, radio name or frequency.',
    ],
    [
      'two positions with one callsign',
      () => {
        const twice = response()
        twice.facility.childFacilities[1].positions[0].callsign = 'SDF_E_TWR'
        return Response.json(twice)
      },
      'vNAS answered unexpectedly: two positions share the callsign SDF_E_TWR.',
    ],
  ])('leaves the list as it was when vNAS answers with %s', async (_, answer, message) => {
    const { before, error } = await syncedThen(answer)

    const { status, body } = await pressSync(cmsAdmin)

    expect(status).toBe(502)
    expect(body.errors[0].message).toBe(`${message} Nothing was changed.`)
    expect(await positions()).toEqual(before)
    expect(error).toHaveBeenCalled()
  })
})
