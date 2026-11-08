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
    expect(await count('tasks')).toBe(22)
    expect(await count('grading-scales')).toBe(1)
    expect(await count('courses')).toBe(2)
    expect(await count('course-versions')).toBe(2)
    expect(await count('lesson-plans')).toBe(7)
    expect(await count('scenarios')).toBe(4)
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
    const shortName = async (callsign: string) =>
      (
        await payload.findByID({
          collection: 'positions',
          id: records.positions[callsign].id,
          user,
          overrideAccess: false,
        })
      ).shortName
    // vNAS's, a CMS admin's override, and a generated one.
    expect(await shortName('IND_83_CTR')).toBe('FLM 83')
    expect(await shortName('SDF_D_APP')).toBe('SDF DR')
    expect(await shortName('SDF_E_TWR')).toBe('SDF LC E')
    // A satellite tower carries its TRACON as its parent facility.
    expect(
      await payload.findByID({
        collection: 'positions',
        id: records.positions.LOU_TWR.id,
        user,
        overrideAccess: false,
      }),
    ).toMatchObject({ parentFacilityId: 'SDF', parentFacilityName: 'Louisville ATCT/TRACON' })

    // A scenario names a position vNAS has since dropped.
    const release = await payload.findByID({
      collection: 'scenarios',
      id: records.scenarios['departure-release'].id,
      depth: 1,
      user,
      overrideAccess: false,
    })
    expect(release.teacherPosition).toMatchObject({ callsign: 'PKB_TWR', retired: true })

    // A lesson plan with a required row grading one of two statements and an optional row.
    const together = await payload.findByID({
      collection: 'lesson-plans',
      id: records['lesson-plans']['X-GC-3'].id,
      depth: 0,
      user,
      overrideAccess: false,
    })
    expect(
      together.tasks?.map(({ task, required, gradesKnowledge, gradesSkill }) => ({
        task,
        required,
        gradesKnowledge,
        gradesSkill,
      })),
    ).toEqual([
      { task: records.tasks.R3.id, required: true, gradesKnowledge: false, gradesSkill: true },
      { task: records.tasks.R1b.id, required: false, gradesKnowledge: true, gradesSkill: false },
    ])

    // A lesson plan for the grid: eight rows, the last on a task retired since.
    const ground = await payload.findByID({
      collection: 'lesson-plans',
      id: records['lesson-plans']['X-GC-4 (edition 2)'].id,
      depth: 1,
      user,
      overrideAccess: false,
    })
    expect(ground.tasks).toHaveLength(8)
    expect(ground.tasks?.at(-1)?.task).toMatchObject({ name: 'Closing a taxiway', retired: true })
  })

  it('refuses a database that has rows, unless asked to reset it', async () => {
    await seedCheck(payload)
    await expect(seedCheck(payload)).rejects.toThrow(/already has rows.*--reset/)

    const again = await seedCheck(payload, { reset: true })
    expect(Object.keys(again.records.tasks)).toHaveLength(22)
    expect((await payload.count({ collection: 'tasks' })).totalDocs).toBe(22)
  })
})
