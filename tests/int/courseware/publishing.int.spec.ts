import { ValidationError, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { callEndpoint, resetCourseware, testPayload } from './helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetCourseware(payload)
})

const POINTS = [
  { label: 'Unsatisfactory', description: 'Not yet' },
  { label: 'Satisfactory', description: 'Meets the standard' },
  { label: 'Exemplary', description: 'Beyond it' },
]

/** A made-up course with a draft version that passes the publishing check. */
async function readyVersion() {
  const scale = await payload.create({
    collection: 'grading-scales',
    data: { name: 'Three point', points: POINTS },
  })
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower' },
  })
  const version = await payload.create({
    collection: 'course-versions',
    data: {
      course: course.id,
      number: 1,
      status: 'draft',
      gradingScale: scale.id,
      defaultMinimum: 2,
    },
  })
  const radio = await payload.create({ collection: 'tasks', data: { name: 'Radio' } })
  const plan = await payload.create({
    collection: 'lesson-plans',
    depth: 0,
    data: {
      courseVersion: version.id,
      code: 'X-TWR-1',
      title: 'Radio',
      theoryItems: [{ task: radio.id }],
    },
  })
  await payload.update({
    collection: 'course-versions',
    id: version.id,
    data: { modules: [{ title: 'Tower', lessonPlans: [plan.id] }] },
  })
  return { scale, course, version, radio, plan }
}

function publish(id: string) {
  return payload.update({ collection: 'course-versions', id, data: { status: 'published' } })
}

async function refusal(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) return error.data.errors.map((entry) => entry.message)
    throw error
  }
  throw new Error('Expected the save to be refused')
}

describe('grading scales', () => {
  it('need two or more points', async () => {
    await expect(
      payload.create({ collection: 'grading-scales', data: { name: 'One', points: [POINTS[0]] } }),
    ).rejects.toThrow()
  })

  it('refuse added, removed or reordered points once a published version uses them', async () => {
    const { scale, version } = await readyVersion()
    await publish(version.id)
    const points = scale.points

    for (const changed of [
      [...points, { label: 'Extra', description: '' }],
      points.slice(0, 2),
      [points[1], points[0], points[2]],
    ]) {
      expect(
        await refusal(
          payload.update({ collection: 'grading-scales', id: scale.id, data: { points: changed } }),
        ),
      ).toEqual([expect.stringMatching(/published/)])
    }

    const reworded = await payload.update({
      collection: 'grading-scales',
      id: scale.id,
      data: { points: points.map((point) => ({ ...point, description: 'Reworded' })) },
    })
    expect(reworded.points.map((point) => point.description)).toEqual([
      'Reworded',
      'Reworded',
      'Reworded',
    ])
  })
})

describe('lesson plan minimums', () => {
  it('start from the course version’s default', async () => {
    const { plan } = await readyVersion()
    expect(plan.minimum).toBe(2)
  })
})

describe('publishing', () => {
  it('makes the version published and the course’s current version', async () => {
    const { course, version } = await readyVersion()

    await publish(version.id)

    const after = await payload.findByID({ collection: 'courses', id: course.id, depth: 0 })
    expect(after.currentVersion).toBe(version.id)
    const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/current')
    expect(body.version.status).toBe('published')
    expect(body.scale).toEqual({
      id: expect.any(String),
      name: 'Three point',
      points: POINTS.map((point, index) => ({ position: index + 1, ...point })),
    })
    expect(body.defaultMinimum).toMatchObject({ position: 2, label: 'Satisfactory' })
    expect(body.modules[0].lessonPlans[0].minimum).toMatchObject({ position: 2 })
  })

  it('refuses with every fault, naming each record', async () => {
    const { version, radio, plan } = await readyVersion()
    const empty = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: version.id },
    })
    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: {
        gradingScale: null,
        modules: [{ title: 'Tower', lessonPlans: [plan.id, empty.id] }],
      },
    })
    await payload.update({ collection: 'tasks', id: radio.id, data: { retired: true } })

    const messages = await refusal(publish(version.id))

    expect(messages).toEqual(
      expect.arrayContaining([
        'The version names no grading scale.',
        'A lesson plan in Tower has no code.',
        'A lesson plan in Tower has no title.',
        'A lesson plan in Tower has no theory item or scenario.',
        'X-TWR-1 uses the retired task Radio.',
      ]),
    )
    const after = await payload.findByID({ collection: 'course-versions', id: version.id })
    expect(after.status).toBe('draft')
  })

  it('does not block on unmapped tasks', async () => {
    const { version } = await readyVersion()
    await expect(publish(version.id)).resolves.toMatchObject({ status: 'published' })
  })

  it('keeps the earlier published version as data when a newer one is published', async () => {
    const { course, version, scale, radio } = await readyVersion()
    await publish(version.id)
    const next = await payload.create({
      collection: 'course-versions',
      data: {
        course: course.id,
        number: 2,
        status: 'draft',
        gradingScale: scale.id,
        defaultMinimum: 1,
      },
    })
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: {
        courseVersion: next.id,
        code: 'X-TWR-1',
        title: 'Radio',
        theoryItems: [{ task: radio.id }],
      },
    })
    await payload.update({
      collection: 'course-versions',
      id: next.id,
      data: { modules: [{ title: 'Tower', lessonPlans: [plan.id] }] },
    })

    await publish(next.id)

    const after = await payload.findByID({ collection: 'courses', id: course.id, depth: 0 })
    expect(after.currentVersion).toBe(next.id)
    const earlier = await payload.findByID({ collection: 'course-versions', id: version.id })
    expect(earlier.status).toBe('published')
  })
})

describe('a published version', () => {
  it('refuses changes to its shape, and saves its wording', async () => {
    const { version, plan, radio } = await readyVersion()
    await publish(version.id)
    const published = await payload.findByID({
      collection: 'course-versions',
      id: version.id,
      depth: 0,
    })
    const other = await payload.create({ collection: 'tasks', data: { name: 'Other' } })

    expect(
      await refusal(
        payload.update({
          collection: 'course-versions',
          id: version.id,
          data: { modules: [...(published.modules ?? []), { title: 'More' }] },
        }),
      ),
    ).toEqual([expect.stringMatching(/published/)])
    expect(
      await refusal(
        payload.update({
          collection: 'lesson-plans',
          id: plan.id,
          data: { theoryItems: [...(plan.theoryItems ?? []), { task: other.id }] },
        }),
      ),
    ).toEqual([expect.stringMatching(/published/)])
    expect(
      await refusal(
        payload.create({
          collection: 'lesson-plans',
          data: { courseVersion: version.id, code: 'X-TWR-2' },
        }),
      ),
    ).toEqual([expect.stringMatching(/published/)])
    expect(
      await refusal(
        payload.update({
          collection: 'course-versions',
          id: version.id,
          data: { status: 'draft' },
        }),
      ),
    ).toEqual([expect.stringMatching(/published/)])

    const renamed = await payload.update({
      collection: 'course-versions',
      id: version.id,
      depth: 0,
      data: {
        description: 'Fixed a typo',
        modules: (published.modules ?? []).map((module) => ({ ...module, title: 'Tower work' })),
      },
    })
    expect(renamed.modules?.[0].title).toBe('Tower work')
    const reworded = await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      depth: 0,
      data: {
        title: 'Radio, reworded',
        theoryItems: (plan.theoryItems ?? []).map((item) => ({ ...item, teacherNotes: 'New' })),
      },
    })
    expect(reworded.title).toBe('Radio, reworded')
    expect(reworded.theoryItems?.[0]).toMatchObject({ task: radio.id, teacherNotes: 'New' })
  })
})
