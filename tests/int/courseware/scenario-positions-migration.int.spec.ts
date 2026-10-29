import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as migration from '@/migrations/20261029_033815_scenarios_pick_positions'
import stored from '../positions/fixtures/vnas-zid.json'
import { resetDatabase, testPayload } from './helpers'

/**
 * The migration that links scenarios' typed positions to Positions (decision 0060), run over
 * scenarios in the old shape. vNAS answers with the stored copy the sync's tests use; no test
 * reaches vNAS itself.
 */

const VNAS_URL = 'https://data-api.vnas.vatsim.net/api/artccs/ZID'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** vNAS answers with this, as a fetch would. */
function vnasAnswers(answer: () => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input) !== VNAS_URL) throw new Error(`Unexpected fetch of ${String(input)}`)
    return answer()
  })
}

type OldScenario = { course: string; name: string; student: string; teacher: string | null }

/**
 * Runs the migration over scenarios in the old shape, beside the real table, and returns how it
 * ended (`'done'` or the message it stopped with) and each scenario's columns afterwards.
 */
async function migrateOver(scenarios: OldScenario[]) {
  const { pool, drizzle } = payload.db as unknown as PostgresAdapter
  const courses = new Map<string, string>()
  for (const { course: code } of scenarios) {
    if (!courses.has(code))
      courses.set(
        code,
        (await payload.create({ collection: 'courses', data: { code, title: code } })).id,
      )
  }
  // The migration names its indexes, which the real table holds.
  const indexes = ['scenarios_student_position_idx', 'scenarios_teacher_position_idx']
  await pool.query(`alter table "scenarios" rename to "scenarios_aside"`)
  for (const index of indexes) await pool.query(`alter index "${index}" rename to "${index}_aside"`)
  try {
    await pool.query(`create table "scenarios" ("id" uuid primary key, "course_id" uuid not null,
      "name" varchar not null, "student_position" varchar not null, "teacher_position" varchar)`)
    for (const { course: code, name, student, teacher } of scenarios) {
      await pool.query(`insert into "scenarios" values (gen_random_uuid(), $1, $2, $3, $4)`, [
        courses.get(code),
        name,
        student,
        teacher,
      ])
    }
    const ended = await migration.up({ db: drizzle, payload, req: {} as PayloadRequest }).then(
      () => 'done',
      (error: Error) => error.message,
    )
    const { rows } = await pool.query(`select * from "scenarios" order by "name"`)
    return { ended, rows }
  } finally {
    await pool.query(`drop table if exists "scenarios"`)
    await pool.query(`alter table "scenarios_aside" rename to "scenarios"`)
    for (const index of indexes)
      await pool.query(`alter index "${index}_aside" rename to "${index}"`)
  }
}

async function positionIds(): Promise<Record<string, string>> {
  const { docs } = await payload.find({ collection: 'positions', pagination: false, depth: 0 })
  return Object.fromEntries(docs.map((position) => [position.callsign, position.id]))
}

describe('the migration to positions picked from Positions', () => {
  it('fills Positions from vNAS and links each scenario’s positions by callsign', async () => {
    vnasAnswers(async () => Response.json(stored))

    const { ended, rows } = await migrateOver([
      { course: 'X-TWR', name: 'Busy afternoon', student: 'LOU_TWR', teacher: 'SDF_D_APP' },
      { course: 'X-CTR', name: 'Quiet night', student: 'IND_83_CTR', teacher: ' pkb_twr ' },
    ])

    expect(ended).toBe('done')
    const ids = await positionIds()
    expect(Object.keys(ids)).toHaveLength(7)
    expect(
      rows.map(({ name, student_position_id, teacher_position_id }) => ({
        name,
        student: student_position_id,
        teacher: teacher_position_id,
      })),
    ).toEqual([
      { name: 'Busy afternoon', student: ids.LOU_TWR, teacher: ids.SDF_D_APP },
      { name: 'Quiet night', student: ids.IND_83_CTR, teacher: ids.PKB_TWR },
    ])
    expect(rows[0]).not.toHaveProperty('student_position')
    // Stored as the sync stores them.
    expect(
      (
        await payload.find({
          collection: 'positions',
          where: { callsign: { equals: 'IND_83_CTR' } },
        })
      ).docs[0],
    ).toMatchObject({ title: 'FLM 83 · Falmouth 83', shortName: 'FLM 83', retired: false })
  })

  it('leaves vNAS alone when there are no scenarios', async () => {
    const fetched = vnasAnswers(async () => Response.json(stored))

    const { ended } = await migrateOver([])

    expect(ended).toBe('done')
    expect(fetched).not.toHaveBeenCalled()
    expect(await positionIds()).toEqual({})
  })

  it('stops, saying to deploy again, when vNAS can’t be reached', async () => {
    vnasAnswers(async () => {
      throw new TypeError('fetch failed')
    })

    const { ended, rows } = await migrateOver([
      { course: 'X-TWR', name: 'Busy afternoon', student: 'LOU_TWR', teacher: 'SDF_D_APP' },
    ])

    expect(ended).toBe(
      'Scenarios now pick their positions from Positions, which is filled from vNAS first, and ' +
        'vNAS could not be used: vNAS could not be reached: fetch failed Nothing was changed. ' +
        'Deploy again.',
    )
    expect(rows).toEqual([expect.objectContaining({ student_position: 'LOU_TWR' })])
  })

  it('stops, naming them, when a position matches none or a scenario has no teacher position', async () => {
    vnasAnswers(async () => Response.json(stored))

    const { ended, rows } = await migrateOver([
      { course: 'X-TWR', name: 'Busy afternoon', student: 'LOU_TWR', teacher: 'SDF_D_APP' },
      { course: 'X-TWR', name: 'Night shift', student: 'LOU_GND', teacher: 'XYZ_TWR' },
      { course: 'X-APP', name: 'Arrival push', student: 'SDF_D_APP', teacher: null },
      { course: 'X-APP', name: 'Blank', student: 'XYZ_APP', teacher: '' },
    ])

    expect(ended).toBe(
      'These scenarios name a position no position has the callsign of: ' +
        'X-APP Blank ("XYZ_APP"), X-TWR Night shift ("LOU_GND", "XYZ_TWR"). ' +
        'These scenarios have no teacher position: X-APP Arrival push, X-APP Blank. ' +
        'Give each a student and a teacher position that vNAS lists, by its callsign, ' +
        'then deploy again.',
    )
    expect(rows.map(({ student_position }) => student_position)).toEqual([
      'SDF_D_APP',
      'XYZ_APP',
      'LOU_TWR',
      'LOU_GND',
    ])
  })
})
