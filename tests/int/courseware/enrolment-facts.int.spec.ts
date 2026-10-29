import { Forbidden, ValidationError, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Course, User } from '@/payload-types'
import { resetDatabase, testPayload } from './helpers'

let payload: Payload
let admin: User
let lead: User
let author: User

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, cid: string, roles: User['roles'] = []): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', cid, roles },
  })
}

beforeEach(async () => {
  await resetDatabase(payload)
  admin = await account('admin@example.com', '1000000', ['training:admin'])
  lead = await account('lead@example.com', '1000009', ['training:lead'])
  author = await account('author@example.com', '1000001')
})

const as = (user: User) => ({ user, overrideAccess: false })

/** A made-up course, written by `author`. */
function course() {
  return payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', authors: [author.cid!] },
  })
}

const facts = {
  prerequisitesNote: 'Read the example policy first.',
  consolidation: { hours: 12, positionTypes: ['GND', 'TWR'] },
  ratingExam: 'S2',
  academyExam: 'S2',
  estimatedWeeks: { min: 4, max: 8 },
  moodleUrl: 'https://moodle.example.com/course/1',
} satisfies Partial<Course>

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

describe("a course's enrolment facts", () => {
  it('start empty: no exams, no consolidation, no weeks override, no exam optional', async () => {
    const created = await course()

    expect(created).toMatchObject({ ratingExam: 'none', academyExam: 'none' })
    expect(created).not.toHaveProperty('examOptional')
    expect(created.consolidation?.hours ?? null).toBeNull()
    expect(created.consolidation?.positionTypes ?? []).toEqual([])
    expect(created.estimatedWeeks?.min ?? null).toBeNull()
    expect(created.estimatedWeeks?.max ?? null).toBeNull()
  })

  it('are set by the Training Admin and leads', async () => {
    const existing = await course()

    for (const user of [admin, lead]) {
      const saved = await payload.update({
        collection: 'courses',
        id: existing.id,
        data: facts,
        ...as(user),
      })
      expect(saved).toMatchObject(facts)
    }
  })

  it('are read by a course author, whose change to them is refused', async () => {
    const existing = await payload.update({
      collection: 'courses',
      id: (await course()).id,
      data: facts,
    })

    const read = await payload.findByID({ collection: 'courses', id: existing.id, ...as(author) })
    expect(read).toMatchObject(facts)

    const change = payload.update({
      collection: 'courses',
      id: existing.id,
      data: { ratingExam: 'S3' },
      ...as(author),
    })
    await expect(change).rejects.toBeInstanceOf(Forbidden)
    await expect(change).rejects.toThrow('You are not allowed to perform this action.')
    expect((await payload.findByID({ collection: 'courses', id: existing.id })).ratingExam).toBe(
      'S2',
    )
  })

  it('refuse consolidation under an hour, or hours without position types and back', async () => {
    const { id } = await course()
    const save = (consolidation: Course['consolidation']) =>
      payload.update({ collection: 'courses', id, data: { consolidation }, ...as(lead) })

    expect(await refusal(save({ hours: 0, positionTypes: ['GND'] }))).toEqual([
      { path: 'consolidation.hours', message: expect.stringContaining('1') },
    ])
    expect(await refusal(save({ hours: 10, positionTypes: [] }))).toEqual([
      {
        path: 'consolidation.positionTypes',
        message: 'Consolidation hours count on at least one position type.',
      },
    ])
    expect(await refusal(save({ hours: null, positionTypes: ['GND'] }))).toEqual([
      {
        path: 'consolidation.hours',
        message: 'Consolidation needs its hours as well as its position types.',
      },
    ])
  })

  it('refuse estimated weeks whose maximum is below the minimum, or only one of the two', async () => {
    const { id } = await course()
    const save = (estimatedWeeks: Course['estimatedWeeks']) =>
      payload.update({ collection: 'courses', id, data: { estimatedWeeks }, ...as(lead) })

    expect(await refusal(save({ min: 6, max: 4 }))).toEqual([
      {
        path: 'estimatedWeeks.max',
        message: 'The most weeks can’t be fewer than the fewest.',
      },
    ])
    expect(await refusal(save({ min: 6, max: null }))).toEqual([
      {
        path: 'estimatedWeeks.max',
        message: 'Give both the fewest and the most weeks, or neither.',
      },
    ])
    expect(await refusal(save({ min: null, max: 6 }))).toEqual([
      {
        path: 'estimatedWeeks.min',
        message: 'Give both the fewest and the most weeks, or neither.',
      },
    ])
    expect(await refusal(save({ min: 0, max: 6 }))).toEqual([
      { path: 'estimatedWeeks.min', message: 'The fewest weeks is at least 1.' },
    ])
    expect((await save({ min: 6, max: 6 })).estimatedWeeks).toMatchObject({ min: 6, max: 6 })
  })

  it('refuse a Moodle link that is not https', async () => {
    const { id } = await course()

    expect(
      await refusal(
        payload.update({
          collection: 'courses',
          id,
          data: { moodleUrl: 'http://moodle.example.com/course/1' },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'moodleUrl', message: 'A link starts with https://.' }])
  })

  it('offer S1 as a rating exam but not as an Academy exam', async () => {
    const { id } = await course()

    await payload.update({ collection: 'courses', id, data: { ratingExam: 'S1' }, ...as(lead) })
    expect(
      await refusal(
        payload.update({
          collection: 'courses',
          id,
          // @ts-expect-error -- S1 has no Academy exam
          data: { academyExam: 'S1' },
          ...as(lead),
        }),
      ),
    ).toEqual([{ path: 'academyExam', message: expect.any(String) }])
  })
})

describe("an edition's completion standard", () => {
  it('is written by a course author in their draft', async () => {
    const owner = await course()
    const draft = await payload.create({
      collection: 'course-versions',
      data: { course: owner.id, number: 1, status: 'draft' },
    })

    const saved = await payload.update({
      collection: 'course-versions',
      id: draft.id,
      data: { completionStandard: 'Pass the exam and every lesson plan.' },
      ...as(author),
    })

    expect(saved.completionStandard).toBe('Pass the exam and every lesson plan.')
  })

  it('is changed by a lead in a published edition', async () => {
    const owner = await course()
    const version = await payload.create({
      collection: 'course-versions',
      data: { course: owner.id, number: 1, status: 'draft' },
    })
    await payload.db.updateOne({
      collection: 'course-versions',
      id: version.id,
      data: { status: 'published' },
    })

    const saved = await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: { completionStandard: 'Pass the exam.' },
      ...as(lead),
    })

    expect(saved.completionStandard).toBe('Pass the exam.')
  })
})
