import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CREDENTIALS } from '@/migrations/20261026_030346_credentials'
import * as tighterRules from '@/migrations/20261028_200131_tighter_course_and_credential_rules'
import type { User } from '@/payload-types'
import { resetDatabase, testPayload } from './helpers'

let payload: Payload
let lead: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  lead = await payload.create({
    collection: 'users',
    data: {
      email: 'lead@example.com',
      password: 'example-password',
      cid: '1000009',
      roles: ['training:lead'],
    },
  })
})

const as = () => ({ user: lead, overrideAccess: false, depth: 0 })

/** Runs the migration over what is saved, and returns the message it stopped with, if any. */
async function migrate(): Promise<string | null> {
  const { drizzle } = payload.db as unknown as PostgresAdapter
  return tighterRules.up({ db: drizzle, payload, req: {} as PayloadRequest }).then(
    () => null,
    (error: Error) => error.message,
  )
}

/** Changes saved rows below the API, as data from before the rules would be. */
async function sql(query: string, values: unknown[] = []) {
  const { pool } = payload.db as unknown as PostgresAdapter
  await pool.query(query, values)
}

const endorsement = (code: string) =>
  payload.create({ collection: 'credentials', data: { code, kind: 'endorsement', name: code } })

describe('the migration to tighter course and credential rules', () => {
  it('passes the credentials the seed migration fills, and an empty database', async () => {
    expect(await migrate()).toBeNull()

    // Each seeded credential meets the rules when saved by a lead, in the order it is listed.
    for (const { code, kind, name, description, rank, grantedOnArrival } of CREDENTIALS) {
      await payload.create({
        collection: 'credentials',
        data: {
          code,
          kind: kind as 'certification' | 'endorsement',
          name,
          description,
          rank,
          grantedOnArrival: grantedOnArrival as ('S1' | 'S2' | 'S3' | 'C1' | 'C3' | 'I1' | 'I3')[],
        },
        ...as(),
      })
    }
    expect(await migrate()).toBeNull()
  })

  it('passes courses and editions that meet the rules', async () => {
    const [a, b, c] = [await endorsement('X-A'), await endorsement('X-B'), await endorsement('X-C')]
    await payload.create({
      collection: 'courses',
      data: {
        code: 'X-TWR',
        title: 'Example Tower',
        prerequisites: [{ anyOf: [a.id, b.id] }, { anyOf: [c.id] }],
        credentialIssued: (await endorsement('X-D')).id,
        estimatedWeeks: { min: 1, max: 2 },
      },
    })

    expect(await migrate()).toBeNull()
  })

  it('stops, naming each credential, course, edition and lesson plan that breaks a rule', async () => {
    // A certification with no rank.
    const unranked = await endorsement('X-NR')
    await sql(`update "credentials" set "kind" = 'certification' where "id" = $1`, [unranked.id])

    // Two certifications granted on arrival for one rating.
    const ground = await payload.create({
      collection: 'credentials',
      data: {
        code: 'X-GC',
        kind: 'certification',
        name: 'Ground',
        rank: 1,
        grantedOnArrival: ['S1'],
      },
    })
    await payload.create({
      collection: 'credentials',
      data: {
        code: 'X-LC',
        kind: 'certification',
        name: 'Local',
        rank: 2,
        grantedOnArrival: ['S2'],
      },
    })
    await sql(
      `insert into "credentials_granted_on_arrival" ("order", "parent_id", "value", "id")
       select 1, "id", 'S1', gen_random_uuid() from "credentials" where "code" = 'X-LC'`,
    )

    // A course naming a credential twice, one requiring the credential it issues, and one with
    // fewest weeks under 1.
    const [a, b, c] = [await endorsement('X-A'), await endorsement('X-B'), await endorsement('X-C')]
    const twice = await payload.create({
      collection: 'courses',
      data: {
        code: 'X-TWR',
        title: 'Tower',
        prerequisites: [{ anyOf: [a.id, b.id] }, { anyOf: [c.id] }],
      },
    })
    await sql(
      `update "courses_rels" set "credentials_id" = $1
       where "parent_id" = $2 and "path" = 'prerequisites.1.anyOf'`,
      [a.id, twice.id],
    )
    const own = await payload.create({
      collection: 'courses',
      data: { code: 'X-APP', title: 'Approach', prerequisites: [{ anyOf: [b.id] }] },
    })
    await sql(`update "courses" set "credential_issued_id" = $1 where "id" = $2`, [b.id, own.id])
    const weeks = await payload.create({
      collection: 'courses',
      data: { code: 'X-DEP', title: 'Departure', estimatedWeeks: { min: 1, max: 3 } },
    })
    await sql(`update "courses" set "estimated_weeks_min" = 0 where "id" = $1`, [weeks.id])

    // An edition whose default minimum, and a lesson plan whose minimum, are off its scale.
    const scale = await payload.create({
      collection: 'grading-scales',
      data: {
        name: 'Three point',
        points: [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }],
      },
    })
    const edition = await payload.create({
      collection: 'course-versions',
      data: {
        course: weeks.id,
        number: 1,
        status: 'draft',
        gradingScale: scale.id,
        defaultMinimum: 2,
      },
      ...as(),
    })
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: edition.id, code: 'X-DEP-1' },
      ...as(),
    })
    await sql(`update "course_versions" set "default_minimum" = 9 where "id" = $1`, [edition.id])
    await sql(`update "lesson_plans" set "minimum" = 4 where "id" = $1`, [plan.id])
    expect(ground.rank).toBe(1)

    expect(await migrate()).toBe(
      'These certifications have no rank, which a certification needs: X-NR. ' +
        'These ratings are granted on arrival for more than one certification, and each brings one: S1 (X-GC and X-LC). ' +
        'These courses name a credential more than once in their prerequisites: X-TWR names X-A. ' +
        'These courses require the credential they issue: X-APP requires X-B. ' +
        'These courses have fewest estimated weeks under 1: X-DEP (0). ' +
        'These editions have a default minimum that is not a point on their grading scale: X-DEP edition 1 default minimum 9. ' +
        'These lesson plans have a minimum that is not a point on their edition’s grading scale: X-DEP-1 in X-DEP edition 1 minimum 4. ' +
        'Correct each, then migrate again.',
    )
  })
})
