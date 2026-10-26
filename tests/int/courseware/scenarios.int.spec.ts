import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { ValidationError, type Payload, type PayloadRequest } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as scenarioMigration from '@/migrations/20261026_021707_scenario_positions_and_difficulty'
import type { Scenario, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

async function course(code: string, authors: string[] = []) {
  const record = await payload.create({
    collection: 'courses',
    data: { code, title: code, authors },
  })
  const version = await payload.create({
    collection: 'course-versions',
    data: { course: record.id, number: 1, status: 'draft' },
  })
  return { course: record, version }
}

async function task(name: string, parent?: string) {
  return payload.create({ collection: 'tasks', data: { name, parent } })
}

function scenario(courseId: string, practicalTasks: { task: string; required?: boolean }[] = []) {
  return payload.create({
    collection: 'scenarios',
    depth: 0,
    data: {
      course: courseId,
      name: 'Busy afternoon',
      airport: 'KXYZ',
      studentPosition: 'XYZ_TWR',
      difficulty: 'hard',
      mode: 'sim',
      practicalTasks,
    },
  })
}

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

describe('scenarios', () => {
  it('expands a parent task into its children, required by default', async () => {
    const { course: owner } = await course('X-TWR')
    const departures = await task('Departures')
    const takeoff = await task('Takeoff clearance', departures.id)
    const luaw = await task('Line up and wait', departures.id)

    const created = await scenario(owner.id, [{ task: departures.id }])

    expect(
      created.practicalTasks?.map((row) => ({ task: row.task, required: row.required })),
    ).toEqual([
      { task: departures.id, required: true },
      { task: takeoff.id, required: true },
      { task: luaw.id, required: true },
    ])
  })

  it('is retired, not deleted', async () => {
    const { course: owner } = await course('X-TWR')
    const user = await payload.create({
      collection: 'users',
      data: { email: 'lead@example.com', password: 'example-password' },
    })
    const created = await scenario(owner.id)

    await expect(
      payload.delete({ collection: 'scenarios', id: created.id, overrideAccess: false, user }),
    ).rejects.toThrow()
    const retired = await payload.update({
      collection: 'scenarios',
      id: created.id,
      data: { retired: true },
    })
    expect(retired.retired).toBe(true)
  })
})

describe('a scenario saved by its course’s author', () => {
  const POSITION =
    'Write the position as VATUSA does: the facility, an optional sector and the type, ' +
    'such as IND_GND or IND_83_CTR.'

  let author: User
  let courseId: string

  beforeEach(async () => {
    author = await payload.create({
      collection: 'users',
      data: { email: 'author@example.com', password: 'example-password', cid: '1000001' },
    })
    courseId = (await course('X-TWR', [author.cid!])).course.id
  })

  function save(data: Partial<Scenario>) {
    return payload.create({
      collection: 'scenarios',
      data: {
        course: courseId,
        name: 'Busy afternoon',
        airport: 'KXYZ',
        studentPosition: 'XYZ_TWR',
        mode: 'sim',
        ...data,
      },
      user: author,
      overrideAccess: false,
    })
  }

  it('records a student position and a teacher position, with or without a sector', async () => {
    for (const [studentPosition, teacherPosition] of [
      ['XYZ_GND', 'XYZ_TWR'],
      ['XYZ_83_CTR', 'XYZ_E_APP'],
      ['XY_1_DEL', 'XYZ_FSS'],
    ]) {
      const saved = await save({ studentPosition, teacherPosition })
      expect(saved).toMatchObject({ studentPosition, teacherPosition })
    }
  })

  it('needs no teacher position', async () => {
    const saved = await save({})

    expect(saved.teacherPosition ?? null).toBeNull()
  })

  it('refuses a student position VATUSA would not accept', async () => {
    for (const studentPosition of [
      'tower',
      'xyz_twr',
      'XYZ',
      'XYZ_RMP',
      'XYZ_1_2_GND',
      'WXYZ_TWR',
      'XYZ_1234_CTR',
      'XYZ_TWR ',
    ]) {
      expect(await refusal(save({ studentPosition }))).toEqual([
        { path: 'studentPosition', message: POSITION },
      ])
    }
  })

  it('refuses a teacher position VATUSA would not accept', async () => {
    for (const teacherPosition of ['tower', 'XYZ_1_2_GND', 'XYZ_RMP']) {
      expect(await refusal(save({ teacherPosition }))).toEqual([
        { path: 'teacherPosition', message: POSITION },
      ])
    }
  })

  it('needs a student position', async () => {
    const refused = await refusal(save({ studentPosition: '' }))

    expect(refused.map(({ path }) => path)).toEqual(['studentPosition'])
  })

  it('picks its difficulty from Easy, Medium and Hard, or none', async () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      expect(await save({ difficulty })).toMatchObject({ difficulty })
    }
    expect((await save({})).difficulty ?? null).toBeNull()
  })

  it('refuses any other difficulty', async () => {
    for (const difficulty of ['Hard', 'very hard']) {
      const refused = await refusal(save({ difficulty: difficulty as Scenario['difficulty'] }))
      expect(refused.map(({ path }) => path)).toEqual(['difficulty'])
    }
  })
})

describe('the migration to Easy, Medium and Hard', () => {
  type OldScenario = { course: string; name: string; difficulty: string | null }

  /**
   * Runs the migration over scenarios in the old shape, as far as its check reads them, and
   * returns the message it stopped with. Every scenario is still there afterwards, unchanged.
   */
  async function refusalOver(scenarios: OldScenario[]): Promise<string> {
    const { pool, drizzle } = payload.db as unknown as PostgresAdapter
    const courses = new Map<string, string>()
    for (const { course: code } of scenarios) {
      if (!courses.has(code)) courses.set(code, (await course(code)).course.id)
    }
    await pool.query(`alter table "scenarios" rename to "scenarios_aside"`)
    try {
      await pool.query(`create table "scenarios" ("id" uuid primary key, "course_id" uuid not null,
        "name" varchar not null, "difficulty" varchar)`)
      for (const { course: code, name, difficulty } of scenarios) {
        await pool.query(`insert into "scenarios" values (gen_random_uuid(), $1, $2, $3)`, [
          courses.get(code),
          name,
          difficulty,
        ])
      }
      const message = await scenarioMigration
        .up({ db: drizzle, payload, req: {} as PayloadRequest })
        .then(
          () => 'The migration did not stop',
          (error: Error) => error.message,
        )
      const { rows } = await pool.query(`select "name", "difficulty" from "scenarios"`)
      expect(rows).toHaveLength(scenarios.length)
      expect(rows).toEqual(
        expect.arrayContaining(scenarios.map(({ name, difficulty }) => ({ name, difficulty }))),
      )
      return message
    } finally {
      await pool.query(`drop table if exists "scenarios"`)
      await pool.query(`alter table "scenarios_aside" rename to "scenarios"`)
    }
  }

  it('stops, naming them, when a difficulty is not Easy, Medium or Hard', async () => {
    expect(
      await refusalOver([
        { course: 'X-TWR', name: 'Busy afternoon', difficulty: 'Hard' },
        { course: 'X-TWR', name: 'Quiet morning', difficulty: 'EASY' },
        { course: 'X-TWR', name: 'Night shift', difficulty: 'Very hard' },
        { course: 'X-APP', name: 'Arrival push', difficulty: '3/5' },
        { course: 'X-APP', name: 'Light traffic', difficulty: null },
        { course: 'X-APP', name: 'Blank', difficulty: '' },
      ]),
    ).toBe(
      'These scenarios have a difficulty other than Easy, Medium or Hard: ' +
        'X-APP Arrival push ("3/5"), X-TWR Night shift ("Very hard"). ' +
        'Change each to Easy, Medium or Hard, or clear it, then migrate again.',
    )
  })
})

describe('scenarios offered by a lesson plan', () => {
  it('may only be scenarios of the lesson plan’s own course', async () => {
    const { version } = await course('X-TWR')
    const { course: other } = await course('X-APP')
    const elsewhere = await scenario(other.id)

    await expect(
      payload.create({
        collection: 'lesson-plans',
        data: { courseVersion: version.id, scenarios: [elsewhere.id] },
      }),
    ).rejects.toThrow()
  })

  async function served(data: Partial<Scenario>) {
    const { course: owner, version } = await course('X-TWR')
    const takeoff = await task('Takeoff clearance')
    const offered = await payload.create({
      collection: 'scenarios',
      data: {
        course: owner.id,
        name: 'Busy afternoon',
        airport: 'KXYZ',
        studentPosition: 'XYZ_TWR',
        mode: 'live',
        practicalTasks: [
          { task: takeoff.id, teacherNotes: 'Hold one for wake turbulence', required: false },
        ],
        ...data,
      },
    })
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: version.id, scenarios: [offered.id] },
    })
    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: { modules: [{ title: 'Tower', lessonPlans: [plan.id] }] },
    })

    const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')
    return { offered, takeoff, scenarios: body.modules[0].lessonPlans[0].scenarios }
  }

  it('are served with their positions, difficulty, practical tasks and teacher notes', async () => {
    const { offered, takeoff, scenarios } = await served({
      teacherPosition: 'XYZ_83_CTR',
      difficulty: 'hard',
    })

    expect(scenarios).toEqual([
      {
        id: offered.id,
        name: 'Busy afternoon',
        airport: 'KXYZ',
        studentPosition: 'XYZ_TWR',
        teacherPosition: 'XYZ_83_CTR',
        difficulty: 'hard',
        mode: 'live',
        retired: false,
        practicalTasks: [
          {
            id: expect.any(String),
            task: { id: takeoff.id, number: '1', name: 'Takeoff clearance' },
            teacherNotes: 'Hold one for wake turbulence',
            required: false,
          },
        ],
      },
    ])
  })

  it('serve null for a teacher position or difficulty not given', async () => {
    const { scenarios } = await served({})

    expect(scenarios[0]).toMatchObject({ teacherPosition: null, difficulty: null })
    expect(scenarios[0]).not.toHaveProperty('position')
  })
})
