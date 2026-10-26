import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { ValidationError, type Payload, type PayloadRequest } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as editionMigration from '@/migrations/20261026_034520_edition_numbers'
import type { User } from '@/payload-types'
import { resetDatabase, testPayload } from './helpers'

let payload: Payload
let admin: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  admin = await payload.create({
    collection: 'users',
    data: {
      email: 'admin@example.com',
      password: 'example-password',
      cid: '1000000',
      roles: ['training:admin'],
    },
  })
})

const as = (user: User) => ({ user, overrideAccess: false, depth: 0 })

function course(code: string) {
  return payload.create({ collection: 'courses', data: { code, title: code } })
}

/** Starts a new edition the way the admin does; the number sent is whatever the form held. */
function startEdition(courseId: string, number = 1) {
  return payload.create({
    collection: 'course-versions',
    data: { course: courseId, number, status: 'draft' },
    ...as(admin),
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

describe('edition numbers', () => {
  it('numbers each course’s editions from 1, apart from other courses', async () => {
    const tower = await course('X-TWR')
    const approach = await course('X-APP')

    const numbers = []
    for (const owner of [tower, approach, tower, tower, approach]) {
      numbers.push((await startEdition(owner.id)).number)
    }

    expect(numbers).toEqual([1, 1, 2, 3, 2])
  })

  it('ignores a number sent with the save, on create and on update', async () => {
    const tower = await course('X-TWR')
    const first = await startEdition(tower.id, 7)
    expect(first.number).toBe(1)

    const second = await startEdition(tower.id, 1)
    expect(second.number).toBe(2)

    const updated = await payload.update({
      collection: 'course-versions',
      id: second.id,
      data: { number: 9, description: 'Changed' },
      ...as(admin),
    })
    expect(updated).toMatchObject({ number: 2, description: 'Changed' })
  })

  it('titles an edition by its course and number', async () => {
    const tower = await course('X-TWR')
    await startEdition(tower.id)
    const second = await startEdition(tower.id, 5)

    expect(second.title).toBe('X-TWR edition 2')
  })

  it('refuses two editions of one course sharing a number', async () => {
    const tower = await course('X-TWR')
    const approach = await course('X-APP')
    await startEdition(tower.id)
    const other = await startEdition(approach.id)

    // Moving X-APP edition 1 into X-TWR would give X-TWR two edition 1s.
    const refused = await refusal(
      payload.update({
        collection: 'course-versions',
        id: other.id,
        data: { course: tower.id },
        ...as(admin),
      }),
    )

    expect(refused).toEqual([{ path: 'number', message: 'X-TWR already has an edition 1.' }])
  })

  it('never gives two editions started at once one number', async () => {
    const tower = await course('X-TWR')

    const started = await Promise.allSettled([1, 2, 3].map(() => startEdition(tower.id)))

    const numbers = started.flatMap((save) =>
      save.status === 'fulfilled' ? [save.value.number] : [],
    )
    expect(numbers.length).toBeGreaterThan(0)
    expect(new Set(numbers).size).toBe(numbers.length)
    // The unique index refuses the saves that lost the race; starting again numbers them.
    for (const save of started) {
      if (save.status === 'fulfilled') continue
      expect(save.reason).toBeInstanceOf(ValidationError)
      expect((save.reason as ValidationError).data.errors).toMatchObject([
        { message: 'Value must be unique' },
      ])
    }
  })
})

describe('the migration to unique edition numbers', () => {
  /**
   * Runs the migration over editions saved before it, titled the old way, and returns the message
   * it stopped with, if any, and the titles afterwards.
   */
  async function migrateOver(
    editions: { course: string; number: number }[],
  ): Promise<{ message: string | null; titles: string[] }> {
    const { pool, drizzle } = payload.db as unknown as PostgresAdapter
    const courses = new Map<string, string>()
    for (const { course: code } of editions) {
      if (!courses.has(code)) courses.set(code, (await course(code)).id)
    }
    await pool.query(`drop index "course_number_idx"`)
    try {
      for (const { course: code, number } of editions) {
        await pool.query(
          `insert into "course_versions" ("id", "course_id", "number", "status", "title")
           values (gen_random_uuid(), $1, $2, 'draft', $3)`,
          [courses.get(code), number, `${code} v${number}`],
        )
      }
      const message = await editionMigration
        .up({ db: drizzle, payload, req: {} as PayloadRequest })
        .then(
          () => null,
          (error: Error) => error.message,
        )
      const { rows } = await pool.query<{ title: string }>(
        `select "title" from "course_versions" order by "title"`,
      )
      return { message, titles: rows.map((row) => row.title) }
    } finally {
      await pool.query(`truncate "course_versions" cascade`)
      await pool.query(
        `create unique index if not exists "course_number_idx"
         on "course_versions" using btree ("course_id", "number")`,
      )
    }
  }

  it('stops, naming them, when a course has two editions with one number', async () => {
    const { message, titles } = await migrateOver([
      { course: 'X-TWR', number: 1 },
      { course: 'X-TWR', number: 2 },
      { course: 'X-TWR', number: 2 },
      { course: 'X-APP', number: 1 },
      { course: 'X-APP', number: 1 },
      { course: 'X-APP', number: 1 },
      { course: 'X-GND', number: 1 },
    ])

    expect(message).toBe(
      'These courses have two or more editions with one number: ' +
        'X-APP edition 1 (3 editions), X-TWR edition 2 (2 editions). ' +
        'Renumber all but one of each, then migrate again.',
    )
    expect(titles).toHaveLength(7)
    expect(titles.every((title) => / v\d$/.test(title))).toBe(true)
  })

  it('retitles each edition when no two share a number', async () => {
    const { message, titles } = await migrateOver([
      { course: 'X-TWR', number: 1 },
      { course: 'X-TWR', number: 2 },
      { course: 'X-APP', number: 1 },
    ])

    expect(message).toBeNull()
    expect(titles).toEqual(['X-APP edition 1', 'X-TWR edition 1', 'X-TWR edition 2'])
  })
})
