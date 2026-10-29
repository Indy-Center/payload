import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PASSWORD, seedCheck } from '../../scripts/seed-check'
import { resetDatabase, testPayload } from './courseware/helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

describe('the browser-check seed', () => {
  it('fills an empty database, readable by a signed-in account', async () => {
    const { records, accounts } = await seedCheck(payload)
    expect(accounts.map((account) => account.email)).toEqual([
      'admin@example.test',
      'lead@example.test',
      'author@example.test',
    ])

    const { user } = await payload.login({
      collection: 'users',
      data: { email: 'lead@example.test', password: PASSWORD },
    })
    const count = async (collection: Parameters<Payload['count']>[0]['collection']) =>
      (await payload.count({ collection, user, overrideAccess: false })).totalDocs

    expect(await count('credentials')).toBe(8)
    expect(await count('frameworks')).toBe(2)
    expect(await count('competencies')).toBe(6)
    expect(await count('sources')).toBe(2)
    expect(await count('tasks')).toBe(9)
    expect(await count('grading-scales')).toBe(1)
    expect(await count('courses')).toBe(2)
    expect(await count('course-versions')).toBe(2)
    expect(await count('lesson-plans')).toBe(4)
    expect(await count('scenarios')).toBe(2)
    expect(await count('positions')).toBe(7)

    const live = await payload.findByID({
      collection: 'course-versions',
      id: records['course-versions']['X-GC edition 1'].id,
      user,
      overrideAccess: false,
    })
    expect(live.status).toBe('published')
    expect(live.number).toBe(1)
    const draft = await payload.findByID({
      collection: 'course-versions',
      id: records['course-versions']['X-GC edition 2'].id,
      user,
      overrideAccess: false,
    })
    expect([draft.status, draft.number]).toEqual(['draft', 2])
    expect(records.positions.IND_83_CTR.url).toContain('/admin/collections/positions/')
  })

  it('refuses a database that has rows, unless asked to reset it', async () => {
    await seedCheck(payload)
    await expect(seedCheck(payload)).rejects.toThrow(/already has rows.*--reset/)

    const again = await seedCheck(payload, { reset: true })
    expect(Object.keys(again.records.tasks)).toHaveLength(9)
    expect((await payload.count({ collection: 'tasks' })).totalDocs).toBe(9)
  })
})
