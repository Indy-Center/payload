import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { callEndpoint, paragraph, resetDatabase, testPayload } from './helpers'

const TRAINING_TOKEN = 'test-training-token'
process.env.TRAINING_API_TOKEN = TRAINING_TOKEN

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
})

/** A made-up course with one version holding one module of two lesson plans. */
async function courseWithVersion(status: 'draft' | 'published' = 'draft') {
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', authors: ['1000001'] },
  })
  const version = await payload.create({
    collection: 'course-versions',
    data: {
      course: course.id,
      number: 1,
      status: 'draft',
      description: 'The first edition',
      time: 600,
      completionStandard: 'Pass every lesson plan.',
    },
  })
  const first = await payload.create({
    collection: 'lesson-plans',
    data: {
      courseVersion: version.id,
      code: 'X-TWR-1',
      title: 'Runways',
      description: 'Which runway is in use',
      body: paragraph('Read about runways.'),
      time: 60,
      isExam: false,
    },
  })
  const second = await payload.create({
    collection: 'lesson-plans',
    data: {
      courseVersion: version.id,
      code: 'X-TWR-2',
      title: 'Exam',
      time: 90,
      isExam: true,
    },
  })
  await payload.update({
    collection: 'course-versions',
    id: version.id,
    data: {
      modules: [
        { title: 'Tower', description: 'Working the tower', lessonPlans: [second.id, first.id] },
      ],
    },
  })
  if (status === 'published') {
    // Below the API: publishing has its own rules and tests (08).
    await payload.db.updateOne({
      collection: 'course-versions',
      id: version.id,
      data: { status: 'published' },
    })
    await payload.db.updateOne({
      collection: 'courses',
      id: course.id,
      data: { currentVersion: version.id },
    })
  }
  return { course, version, first, second }
}

describe('the one-document course version', () => {
  it('returns a draft version fully resolved, modules and lesson plans in order', async () => {
    const { course, version, first, second } = await courseWithVersion()

    const { status, body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')

    expect(status).toBe(200)
    expect(body.course).toEqual({
      id: course.id,
      code: 'X-TWR',
      title: 'Example Tower',
      authors: ['1000001'],
      prerequisitesNote: '',
      consolidation: null,
      ratingExam: null,
      academyExam: null,
      estimatedWeeks: null,
      examOptional: false,
      moodleUrl: null,
      prerequisites: [],
      credentialIssued: null,
    })
    expect(body.version).toEqual({
      id: version.id,
      number: 1,
      status: 'draft',
      description: 'The first edition',
      time: 600,
      completionStandard: 'Pass every lesson plan.',
      updatedAt: expect.any(String),
    })
    expect(body.modules).toHaveLength(1)
    expect(body.modules[0]).toMatchObject({ title: 'Tower', description: 'Working the tower' })
    expect(body.modules[0].lessonPlans.map((plan: { id: string }) => plan.id)).toEqual([
      second.id,
      first.id,
    ])
    expect(body.modules[0].lessonPlans[1]).toMatchObject({
      code: 'X-TWR-1',
      title: 'Runways',
      description: 'Which runway is in use',
      time: 60,
      isExam: false,
    })
    expect(body.modules[0].lessonPlans[1].bodyHtml).toContain('Read about runways.')
  })

  it("carries the course's enrolment facts, exams as their rating", async () => {
    const { course } = await courseWithVersion()
    await payload.update({
      collection: 'courses',
      id: course.id,
      data: {
        prerequisitesNote: 'Read the example policy first.',
        consolidation: { hours: 12, positionTypes: ['GND', 'TWR'] },
        ratingExam: 'S2',
        academyExam: 'S3',
        estimatedWeeks: { min: 4, max: 8 },
        examOptional: true,
        moodleUrl: 'https://moodle.example.com/course/1',
      },
    })

    const { body } = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')

    expect(body.course).toEqual({
      id: course.id,
      code: 'X-TWR',
      title: 'Example Tower',
      authors: ['1000001'],
      prerequisitesNote: 'Read the example policy first.',
      consolidation: { hours: 12, positionTypes: ['GND', 'TWR'] },
      ratingExam: 'S2',
      academyExam: 'S3',
      estimatedWeeks: { min: 4, max: 8 },
      examOptional: true,
      moodleUrl: 'https://moodle.example.com/course/1',
      prerequisites: [],
      credentialIssued: null,
    })
  })

  it('has no current version until one is published', async () => {
    await courseWithVersion()

    const { status } = await callEndpoint(payload, '/courseware/courses/X-TWR/current')

    expect(status).toBe(404)
  })

  it('returns the published version as current, and no draft beside it', async () => {
    const { version } = await courseWithVersion('published')

    const current = await callEndpoint(payload, '/courseware/courses/X-TWR/current')
    const draft = await callEndpoint(payload, '/courseware/courses/X-TWR/draft')

    expect(current.status).toBe(200)
    expect(current.body.version).toMatchObject({ id: version.id, status: 'published' })
    expect(draft.status).toBe(404)
  })

  it('answers 404 for a course that does not exist', async () => {
    const { status } = await callEndpoint(payload, '/courseware/courses/NOPE/current')
    expect(status).toBe(404)
  })

  it('refuses a request with no credential or a wrong one', async () => {
    await courseWithVersion('published')

    const none = await callEndpoint(payload, '/courseware/courses/X-TWR/current', { token: null })
    const wrong = await callEndpoint(payload, '/courseware/courses/X-TWR/current', {
      token: 'not-it',
    })

    expect(none.status).toBe(401)
    expect(wrong.status).toBe(401)
  })

  it("answers training-tools' credential as it does the library's", async () => {
    const { version } = await courseWithVersion('published')

    const fromLibrary = await callEndpoint(payload, '/courseware/courses/X-TWR/current')
    const fromTraining = await callEndpoint(payload, '/courseware/courses/X-TWR/current', {
      token: TRAINING_TOKEN,
    })

    expect(fromTraining.status).toBe(200)
    expect(fromTraining.body.version).toMatchObject({ id: version.id, status: 'published' })
    expect(fromTraining.body).toEqual(fromLibrary.body)
  })
})

describe('the course list', () => {
  it('lists every course with its current version and newest draft', async () => {
    const { course, version } = await courseWithVersion('published')
    const next = await payload.create({
      collection: 'course-versions',
      data: { course: course.id, number: 2, status: 'draft' },
    })
    const other = await payload.create({
      collection: 'courses',
      data: { code: 'X-APP', title: 'Example Approach' },
    })

    const { status, body } = await callEndpoint(payload, '/courseware/courses')

    expect(status).toBe(200)
    expect(body.courses).toEqual([
      {
        id: other.id,
        code: 'X-APP',
        title: 'Example Approach',
        authors: [],
        currentVersion: null,
        draftVersion: null,
      },
      {
        id: course.id,
        code: 'X-TWR',
        title: 'Example Tower',
        authors: ['1000001'],
        currentVersion: { id: version.id, number: 1 },
        draftVersion: { id: next.id, number: 2 },
      },
    ])
  })

  it('refuses a request without the library credential', async () => {
    const { status } = await callEndpoint(payload, '/courseware/courses', { token: null })
    expect(status).toBe(401)
  })
})

describe('the reads training-tools does not make', () => {
  it("refuse training-tools' credential", async () => {
    await courseWithVersion('published')

    for (const path of ['/courseware/courses', '/courseware/catalogue']) {
      expect(await callEndpoint(payload, path, { token: TRAINING_TOKEN })).toEqual({
        status: 401,
        body: { error: 'Unauthorized' },
      })
    }
  })

  it("refuse training-tools' credential on a draft version", async () => {
    await courseWithVersion('draft')

    expect(
      await callEndpoint(payload, '/courseware/courses/X-TWR/draft', { token: TRAINING_TOKEN }),
    ).toEqual({ status: 401, body: { error: 'Unauthorized' } })
  })
})

describe('retire, never delete', () => {
  it('refuses to delete any courseware record, even for a signed-in user', async () => {
    const { course, version, first } = await courseWithVersion()
    const user = await payload.create({
      collection: 'users',
      data: { email: 'engineer@example.com', password: 'example-password' },
    })

    for (const [collection, id] of [
      ['courses', course.id],
      ['course-versions', version.id],
      ['lesson-plans', first.id],
    ] as const) {
      await expect(
        payload.delete({ collection, id, overrideAccess: false, user }),
      ).rejects.toThrow()
      expect(await payload.findByID({ collection, id })).toBeTruthy()
    }
  })
})
