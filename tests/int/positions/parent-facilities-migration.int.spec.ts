import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as migration from '@/migrations/20261102_164652_position_parent_facilities'
import { position, resetDatabase, testPayload } from '../courseware/helpers'

/**
 * The migration that gives each stored position its facility's parent (payload decision 0005),
 * run over positions saved before the two columns existed. The made-up positions' facility is
 * their callsign's prefix; the parents are vNAS's tree as the migration holds it.
 */

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

/**
 * Takes the two columns away from the saved positions, runs the migration, and returns the message
 * it stopped with (or null) and which parent columns it left on the table. The columns are there
 * again afterwards either way.
 */
async function migrate(): Promise<{ stoppedWith: string | null; parentColumns: string[] }> {
  const { pool, drizzle } = payload.db as unknown as PostgresAdapter
  await pool.query(`alter table "positions" drop column "parent_facility_id"`)
  await pool.query(`alter table "positions" drop column "parent_facility_name"`)
  try {
    const stoppedWith = await migration
      .up({ db: drizzle, payload, req: {} as PayloadRequest })
      .then(
        () => null,
        (error: Error) => error.message,
      )
    const { rows } = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'positions' and column_name like 'parent_facility_%'
       order by column_name`,
    )
    return { stoppedWith, parentColumns: rows.map((row) => row.column_name) }
  } finally {
    await pool.query(
      `alter table "positions" add column if not exists "parent_facility_id" varchar`,
    )
    await pool.query(
      `alter table "positions" add column if not exists "parent_facility_name" varchar`,
    )
  }
}

async function parents() {
  const { docs } = await payload.find({
    collection: 'positions',
    sort: 'callsign',
    pagination: false,
    depth: 0,
  })
  return docs.map(({ callsign, parentFacilityId, parentFacilityName }) => ({
    callsign,
    parentFacilityId,
    parentFacilityName,
  }))
}

describe('the migration to positions with their parent facility', () => {
  it('fills the parent of positions at all three levels, a retired one included', async () => {
    await position(payload, 'ZID_TMU')
    await position(payload, 'CMH_APP')
    await position(payload, 'DAY_TWR')
    await position(payload, 'LOU_TWR', { retired: true })

    expect((await migrate()).stoppedWith).toBeNull()

    expect(await parents()).toEqual([
      { callsign: 'CMH_APP', parentFacilityId: 'ZID', parentFacilityName: 'Indianapolis ARTCC' },
      {
        callsign: 'DAY_TWR',
        parentFacilityId: 'CMH',
        parentFacilityName: 'Columbus ATCT/TRACON',
      },
      {
        callsign: 'LOU_TWR',
        parentFacilityId: 'SDF',
        parentFacilityName: 'Louisville ATCT/TRACON',
      },
      { callsign: 'ZID_TMU', parentFacilityId: null, parentFacilityName: null },
    ])
  })

  it('does nothing to an empty list, before the first sync', async () => {
    expect((await migrate()).stoppedWith).toBeNull()
    expect(await parents()).toEqual([])
  })

  it('stops, naming each position whose facility it does not know, and changes nothing', async () => {
    await position(payload, 'CMH_APP')
    await position(payload, 'XYZ_TWR')
    await position(payload, 'ABC_GND')

    // The columns still being absent shows it stopped before its first write.
    expect(await migrate()).toEqual({
      stoppedWith:
        'These positions are in a facility this migration has no parent for: ' +
        'ABC_GND (ABC), XYZ_TWR (XYZ). Nothing was changed. Add the facility to the migration ' +
        'from vNAS’s tree and migrate again.',
      parentColumns: [],
    })
  })
})
