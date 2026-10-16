import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

async function course(code: string) {
  const record = await payload.create({ collection: 'courses', data: { code, title: code } })
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
      position: 'XYZ_TWR',
      difficulty: 'Hard',
      mode: 'sim',
      practicalTasks,
    },
  })
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

  it('refuses a position not in VATUSA format', async () => {
    const { course: owner } = await course('X-TWR')
    await expect(
      payload.create({
        collection: 'scenarios',
        data: { course: owner.id, name: 'Bad', airport: 'KXYZ', position: 'tower', mode: 'live' },
      }),
    ).rejects.toThrow()
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

  it('are served with their practical tasks and teacher notes', async () => {
    const { course: owner, version } = await course('X-TWR')
    const takeoff = await task('Takeoff clearance')
    const offered = await payload.create({
      collection: 'scenarios',
      data: {
        course: owner.id,
        name: 'Busy afternoon',
        airport: 'KXYZ',
        position: 'XYZ_TWR',
        difficulty: 'Hard',
        mode: 'live',
        practicalTasks: [
          { task: takeoff.id, teacherNotes: 'Hold one for wake turbulence', required: false },
        ],
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

    expect(body.modules[0].lessonPlans[0].scenarios).toEqual([
      {
        id: offered.id,
        name: 'Busy afternoon',
        airport: 'KXYZ',
        position: 'XYZ_TWR',
        difficulty: 'Hard',
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
})
