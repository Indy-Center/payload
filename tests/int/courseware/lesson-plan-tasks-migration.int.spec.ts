import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as migration from '@/migrations/20261108_050841_lesson_plans_hold_every_task'
import { resetDatabase, scenarioPositions, testPayload } from './helpers'

/**
 * The migration to lesson plans that hold every task (decision 0065), run over theory items and
 * practical tasks in the old shape: the old tables are made beside the real ones, which are put
 * aside while it runs.
 */

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

const query = (text: string, values: unknown[] = []) =>
  (payload.db as unknown as PostgresAdapter).pool.query(text, values)

type OldRow = { id: string; order: number; plan: string; task: string; teacherNotes: string | null }
type OldPractical = { id: string; order: number; scenario: string; task: string }

/** Runs the migration over rows in the old shape, and returns how it ended. */
async function migrateOver(theoryItems: OldRow[], practicalTasks: OldPractical[]) {
  // The migration names the new table's indexes, which the real table holds.
  const { rows: indexes } = await query(
    `select indexname from pg_indexes where tablename = 'lesson_plans_tasks'`,
  )
  await query(`alter table "lesson_plans_tasks" rename to "lesson_plans_tasks_aside"`)
  for (const { indexname } of indexes)
    await query(`alter index "${indexname}" rename to "${indexname}_aside"`)
  let ended: string
  try {
    await query(`create table "lesson_plans_theory_items" ("_order" integer not null,
      "_parent_id" uuid not null references "lesson_plans"("id") on delete cascade,
      "id" varchar primary key not null, "task_id" uuid not null, "teacher_notes" varchar)`)
    await query(`create table "scenarios_practical_tasks" ("_order" integer not null,
      "_parent_id" uuid not null references "scenarios"("id") on delete cascade,
      "id" varchar primary key not null, "task_id" uuid not null, "teacher_notes" varchar,
      "required" boolean default true)`)
    for (const row of theoryItems) {
      await query(`insert into "lesson_plans_theory_items" values ($1, $2, $3, $4, $5)`, [
        row.order,
        row.plan,
        row.id,
        row.task,
        row.teacherNotes,
      ])
    }
    for (const row of practicalTasks) {
      await query(
        `insert into "scenarios_practical_tasks" values ($1, $2, $3, $4, 'Pose it', false)`,
        [row.order, row.scenario, row.id, row.task],
      )
    }
    ended = await migration
      .up({
        db: (payload.db as unknown as PostgresAdapter).drizzle,
        payload,
        req: {} as PayloadRequest,
      })
      .then(
        () => 'done',
        (error: Error) => error.message,
      )
  } finally {
    // Done, the migration's own table is the real one; otherwise the real one comes back.
    const { rows } = await query(`select to_regclass('lesson_plans_tasks') as made`)
    if (rows[0].made && ended! === 'done') {
      await query(`drop table "lesson_plans_tasks_aside"`)
    } else {
      await query(`drop table if exists "lesson_plans_tasks"`)
      await query(`drop table if exists "lesson_plans_theory_items"`)
      await query(`drop table if exists "scenarios_practical_tasks"`)
      await query(`alter table "lesson_plans_tasks_aside" rename to "lesson_plans_tasks"`)
      for (const { indexname } of indexes)
        await query(`alter index "${indexname}_aside" rename to "${indexname}"`)
    }
  }
  return ended
}

async function setting() {
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower' },
  })
  const version = await payload.create({
    collection: 'course-versions',
    data: { course: course.id, number: 1, status: 'draft' },
  })
  const task = (name: string) => payload.create({ collection: 'tasks', data: { name } })
  const [radio, readbacks, clearances] = [
    await task('Radio'),
    await task('Readbacks'),
    await task('Clearances'),
  ]
  const plan = (code: string) =>
    payload.create({ collection: 'lesson-plans', data: { courseVersion: version.id, code } })
  const scenario = await payload.create({
    collection: 'scenarios',
    data: {
      course: course.id,
      name: 'Quiet',
      airport: 'KXYZ',
      ...(await scenarioPositions(payload)),
    },
  })
  return {
    radio,
    readbacks,
    clearances,
    first: await plan('X-TWR-1'),
    second: await plan('X-TWR-2'),
    scenario,
  }
}

describe('the migration to lesson plans that hold every task', () => {
  it('carries theory items over in order, with their notes, and required', async () => {
    const { radio, readbacks, clearances, first, second, scenario } = await setting()

    const ended = await migrateOver(
      [
        // Stored out of order: `_order` is what counts.
        { id: 'row-b', order: 2, plan: first.id, task: readbacks.id, teacherNotes: null },
        { id: 'row-a', order: 1, plan: first.id, task: radio.id, teacherNotes: 'Ask why' },
        { id: 'row-c', order: 1, plan: second.id, task: clearances.id, teacherNotes: 'Read one' },
      ],
      [{ id: 'practical-a', order: 1, scenario: scenario.id, task: radio.id }],
    )

    expect(ended).toBe('done')
    const read = (id: string) =>
      payload.findByID({ collection: 'lesson-plans', id, depth: 0 }).then((plan) => plan.tasks)
    expect(await read(first.id)).toEqual([
      { id: 'row-a', task: radio.id, required: true, teacherNotes: 'Ask why' },
      { id: 'row-b', task: readbacks.id, required: true, teacherNotes: null },
    ])
    expect(await read(second.id)).toMatchObject([{ id: 'row-c', teacherNotes: 'Read one' }])

    // Practical tasks went with their table.
    const { rows } = await query(
      `select to_regclass('scenarios_practical_tasks') as practical,
        to_regclass('lesson_plans_theory_items') as theory`,
    )
    expect(rows[0]).toEqual({ practical: null, theory: null })
    expect(
      await payload.findByID({ collection: 'scenarios', id: scenario.id, depth: 0 }),
    ).not.toHaveProperty('practicalTasks')

    // The carried rows save as they are.
    const saved = await payload.update({
      collection: 'lesson-plans',
      id: first.id,
      depth: 0,
      data: { title: 'Radio' },
    })
    expect(saved.tasks?.map((row) => row.id)).toEqual(['row-a', 'row-b'])
  })

  it('runs on a database with no theory items or practical tasks', async () => {
    const { first } = await setting()

    expect(await migrateOver([], [])).toBe('done')
    expect(
      (await payload.findByID({ collection: 'lesson-plans', id: first.id, depth: 0 })).tasks,
    ).toEqual([])
  })
})
