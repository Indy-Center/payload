import { NotFound, ValidationError, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { callEndpoint, resetDatabase, scenarioPositions, testPayload } from './helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
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

  describe('must be a point on the edition’s grading scale', () => {
    const offScale = (value: number) =>
      `${value} is not a point on Three point, which has 3 points. Choose 1 to 3.`

    async function signedInLead() {
      const lead = await payload.create({
        collection: 'users',
        data: {
          email: 'lead@example.com',
          password: 'example-password',
          cid: '1000009',
          roles: ['training:lead'],
        },
      })
      return { user: lead, overrideAccess: false }
    }

    async function refusedAt(promise: Promise<unknown>) {
      try {
        await promise
      } catch (error) {
        if (error instanceof ValidationError)
          return error.data.errors.map(({ path, message }) => ({ path, message }))
        throw error
      }
      throw new Error('Expected the save to be refused')
    }

    it('for an edition’s default minimum, whenever the edition is saved', async () => {
      const as = await signedInLead()
      const { version, course, scale } = await readyVersion()
      const save = (data: object, id = version.id) =>
        payload.update({ collection: 'course-versions', id, data, ...as })

      expect(await refusedAt(save({ defaultMinimum: 4 }))).toEqual([
        { path: 'defaultMinimum', message: offScale(4) },
      ])
      expect(await refusedAt(save({ defaultMinimum: 1.5 }))).toEqual([
        { path: 'defaultMinimum', message: offScale(1.5) },
      ])
      expect((await save({ defaultMinimum: 3 })).defaultMinimum).toBe(3)

      // A smaller scale leaves the stored default off it.
      const small = await payload.create({
        collection: 'grading-scales',
        data: { name: 'Two point', points: POINTS.slice(0, 2) },
      })
      expect(await refusedAt(save({ gradingScale: small.id }))).toEqual([
        {
          path: 'defaultMinimum',
          message: '3 is not a point on Two point, which has 2 points. Choose 1 to 2.',
        },
      ])
      expect((await save({ gradingScale: small.id, defaultMinimum: 2 })).defaultMinimum).toBe(2)

      // A new edition is checked the same way.
      expect(
        await refusedAt(
          payload.create({
            collection: 'course-versions',
            data: {
              course: course.id,
              number: 1,
              status: 'draft',
              gradingScale: scale.id,
              defaultMinimum: 9,
            },
            ...as,
          }),
        ),
      ).toEqual([{ path: 'defaultMinimum', message: offScale(9) }])
    })

    it('for a lesson plan’s minimum, in a draft or a published edition', async () => {
      const as = await signedInLead()
      const { version, plan } = await readyVersion()
      const save = (data: object) =>
        payload.update({ collection: 'lesson-plans', id: plan.id, data, ...as })

      expect(await refusedAt(save({ minimum: 4 }))).toEqual([
        { path: 'minimum', message: offScale(4) },
      ])
      expect((await save({ minimum: 3 })).minimum).toBe(3)
      expect(
        await refusedAt(
          payload.create({
            collection: 'lesson-plans',
            data: { courseVersion: version.id, code: 'X-TWR-2', minimum: 7 },
            ...as,
          }),
        ),
      ).toEqual([{ path: 'minimum', message: offScale(7) }])

      await publish(version.id)
      expect(await refusedAt(save({ minimum: 4 }))).toEqual([
        { path: 'minimum', message: offScale(4) },
      ])
      expect((await save({ minimum: 1 })).minimum).toBe(1)
    })

    it('does not report a missing scale or edition as not found', async () => {
      const as = await signedInLead()
      const { version } = await readyVersion()
      const missing = '00000000-0000-7000-8000-000000000000'

      // The minimum check steps aside; the saved reference is refused further down, by the
      // database's own foreign key, as it was before the check existed.
      const scaleFault = await payload
        .update({
          collection: 'course-versions',
          id: version.id,
          data: { gradingScale: missing, defaultMinimum: 2 },
          ...as,
        })
        .catch((error: unknown) => error)
      expect(scaleFault).toBeInstanceOf(Error)
      expect(scaleFault).not.toBeInstanceOf(NotFound)

      const editionFault = await payload
        .create({
          collection: 'lesson-plans',
          data: { courseVersion: missing, code: 'X-TWR-9', minimum: 2 },
          ...as,
        })
        .catch((error: unknown) => error)
      expect(editionFault).toBeInstanceOf(Error)
      expect(editionFault).not.toBeInstanceOf(NotFound)
    })

    it('only once the edition has a scale to check against', async () => {
      const as = await signedInLead()
      const course = await payload.create({
        collection: 'courses',
        data: { code: 'X-TWR', title: 'Example Tower' },
      })
      const version = await payload.create({
        collection: 'course-versions',
        data: { course: course.id, number: 1, status: 'draft', defaultMinimum: 5 },
        ...as,
      })
      const plan = await payload.create({
        collection: 'lesson-plans',
        data: { courseVersion: version.id, code: 'X-TWR-1' },
        ...as,
      })
      expect(plan.minimum).toBe(5)

      // The scale arrives with the default still off it: refused until it fits.
      const scale = await payload.create({
        collection: 'grading-scales',
        data: { name: 'Three point', points: POINTS },
      })
      expect(
        await refusedAt(
          payload.update({
            collection: 'course-versions',
            id: version.id,
            data: { gradingScale: scale.id },
            ...as,
          }),
        ),
      ).toEqual([{ path: 'defaultMinimum', message: offScale(5) }])
    })
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

describe('a published edition', () => {
  const SCALE_LOCKED =
    'This edition is published, so its grading scale cannot change: grades already given are points on it.'
  const NEW_PLAN =
    'This edition is published, so adding a lesson plan to it is a structural change, which needs the Training Admin or a lead.'
  const PLAN_STRUCTURE =
    'This lesson plan is in a published edition, so changing its theory items, their order, its minimum, the scenarios it offers or its edition is a structural change, which needs the Training Admin or a lead. Its wording and teacher notes can still change.'
  const SCENARIO_STRUCTURE =
    'A published edition offers this scenario, so changing its practical tasks or their required flags is a structural change, which needs the Training Admin or a lead. Its wording and teacher notes can still change.'

  let admin: User
  let lead: User
  let author: User

  beforeEach(async () => {
    const account = (email: string, cid: string, roles: User['roles'] = []) =>
      payload.create({
        collection: 'users',
        data: { email, password: 'example-password', cid, roles },
      })
    admin = await account('admin@example.com', '1000000', ['training:admin'])
    lead = await account('lead@example.com', '1000009', ['training:lead'])
    author = await account('author@example.com', '1000001')
  })

  const as = (user: User) => ({ user, overrideAccess: false, depth: 0 })

  /**
   * A published edition of a course the author writes, whose lesson plan has two theory items and
   * offers a scenario with two practical tasks, beside a draft of the next edition.
   */
  async function publishedEdition() {
    const ready = await readyVersion()
    const { course, version, radio, scale } = ready
    await payload.update({ collection: 'courses', id: course.id, data: { authors: [author.cid!] } })
    const readbacks = await payload.create({ collection: 'tasks', data: { name: 'Readbacks' } })
    const other = await payload.create({ collection: 'tasks', data: { name: 'Other' } })
    const scenario = await payload.create({
      collection: 'scenarios',
      depth: 0,
      data: {
        course: course.id,
        name: 'Quiet',
        airport: 'KXYZ',
        ...(await scenarioPositions(payload)),
        mode: 'sim',
        practicalTasks: [{ task: radio.id }, { task: readbacks.id, required: false }],
      },
    })
    const plan = await payload.update({
      collection: 'lesson-plans',
      id: ready.plan.id,
      depth: 0,
      data: {
        theoryItems: [...(ready.plan.theoryItems ?? []), { task: readbacks.id }],
        scenarios: [scenario.id],
      },
    })
    await publish(version.id)
    const draft = await payload.create({
      collection: 'course-versions',
      depth: 0,
      data: {
        course: course.id,
        number: 2,
        status: 'draft',
        gradingScale: scale.id,
        defaultMinimum: 2,
      },
    })
    const draftPlan = await payload.create({
      collection: 'lesson-plans',
      depth: 0,
      data: { courseVersion: draft.id, code: 'X-TWR-1', theoryItems: [{ task: radio.id }] },
    })
    const published = await payload.findByID({
      collection: 'course-versions',
      id: version.id,
      depth: 0,
    })
    return { ...ready, version: published, plan, scenario, readbacks, other, draft, draftPlan }
  }

  it('keeps its grading scale, whoever changes it', async () => {
    const { version } = await publishedEdition()
    const another = await payload.create({
      collection: 'grading-scales',
      data: { name: 'Two point', points: [{ label: 'No' }, { label: 'Yes' }] },
    })

    for (const user of [admin, lead]) {
      expect(
        await refusal(
          payload.update({
            collection: 'course-versions',
            id: version.id,
            data: { gradingScale: another.id },
            ...as(user),
          }),
        ),
      ).toEqual([SCALE_LOCKED])
    }
  })

  it('stays published', async () => {
    const { version } = await publishedEdition()
    expect(
      await refusal(
        payload.update({
          collection: 'course-versions',
          id: version.id,
          data: { status: 'draft' },
          ...as(lead),
        }),
      ),
    ).toEqual(['A published course version stays published.'])
  })

  it('takes structural changes from the Training Admin and leads', async () => {
    const { version, plan, scenario, radio, readbacks, other } = await publishedEdition()

    for (const [index, user] of [admin, lead].entries()) {
      const added = await payload.create({
        collection: 'lesson-plans',
        data: {
          courseVersion: version.id,
          code: `X-TWR-${index + 2}`,
          title: 'Added',
          theoryItems: [{ task: other.id }],
        },
        ...as(user),
      })
      const [tower] = version.modules ?? []
      const reshaped = await payload.update({
        collection: 'course-versions',
        id: version.id,
        data: {
          defaultMinimum: 3,
          modules: [
            { title: 'Added first', lessonPlans: [added.id] },
            { ...tower, lessonPlans: [...(tower.lessonPlans ?? [])].reverse() },
          ],
        },
        ...as(user),
      })
      expect(reshaped.defaultMinimum).toBe(3)
      expect(reshaped.modules?.[0].lessonPlans).toEqual([added.id])

      const replanned = await payload.update({
        collection: 'lesson-plans',
        id: plan.id,
        data: {
          minimum: 3,
          theoryItems: [{ task: other.id }, ...[...(plan.theoryItems ?? [])].reverse().slice(1)],
          scenarios: [],
        },
        ...as(user),
      })
      expect(replanned.minimum).toBe(3)
      expect(replanned.theoryItems?.map((item) => item.task)).toEqual([other.id, radio.id])
      expect(replanned.scenarios).toEqual([])

      const retasked = await payload.update({
        collection: 'scenarios',
        id: scenario.id,
        data: {
          practicalTasks: [
            { task: readbacks.id, required: true },
            { task: other.id, required: false },
          ],
        },
        ...as(user),
      })
      expect(
        retasked.practicalTasks?.map((row) => ({ task: row.task, required: row.required })),
      ).toEqual([
        { task: readbacks.id, required: true },
        { task: other.id, required: false },
      ])
    }
  })

  it('refuses a course author’s structural change, saying it needs a lead', async () => {
    const { version, plan, scenario, other, draft, draftPlan } = await publishedEdition()
    const items = plan.theoryItems ?? []
    const rows = scenario.practicalTasks ?? []

    // The edition's own record is drafts-only for a course author (decision 0018).
    await expect(
      payload.update({
        collection: 'course-versions',
        id: version.id,
        data: { modules: [...(version.modules ?? []), { title: 'More' }] },
        ...as(author),
      }),
    ).rejects.toThrow('You are not allowed to perform this action.')

    for (const data of [
      { theoryItems: [...items, { task: other.id }] },
      { theoryItems: items.slice(1) },
      { theoryItems: [...items].reverse() },
      { minimum: 3 },
      { scenarios: [] },
      { courseVersion: draft.id },
    ]) {
      expect(
        await refusal(
          payload.update({ collection: 'lesson-plans', id: plan.id, data, ...as(author) }),
        ),
      ).toEqual([PLAN_STRUCTURE])
    }

    expect(
      await refusal(
        payload.create({
          collection: 'lesson-plans',
          data: { courseVersion: version.id, code: 'X-TWR-2' },
          ...as(author),
        }),
      ),
    ).toEqual([NEW_PLAN])
    expect(
      await refusal(
        payload.update({
          collection: 'lesson-plans',
          id: draftPlan.id,
          data: { courseVersion: version.id },
          ...as(author),
        }),
      ),
    ).toEqual([NEW_PLAN])

    for (const practicalTasks of [
      [...rows, { task: other.id }],
      rows.slice(1),
      [...rows].reverse(),
      rows.map((row) => ({ ...row, required: !row.required })),
    ]) {
      expect(
        await refusal(
          payload.update({
            collection: 'scenarios',
            id: scenario.id,
            data: { practicalTasks },
            ...as(author),
          }),
        ),
      ).toEqual([SCENARIO_STRUCTURE])
    }

    const after = await payload.findByID({ collection: 'lesson-plans', id: plan.id, depth: 0 })
    expect(after.theoryItems).toEqual(items)
    expect(after.minimum).toBe(plan.minimum)
  })

  it('takes a course author’s wording and teacher notes', async () => {
    const { plan, scenario } = await publishedEdition()

    const reworded = await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: {
        title: 'Radio, reworded',
        description: 'Fixed a typo',
        theoryItems: (plan.theoryItems ?? []).map((item) => ({ ...item, teacherNotes: 'New' })),
      },
      ...as(author),
    })
    expect(reworded.title).toBe('Radio, reworded')
    expect(reworded.theoryItems?.map((item) => item.teacherNotes)).toEqual(['New', 'New'])

    const renoted = await payload.update({
      collection: 'scenarios',
      id: scenario.id,
      data: {
        airport: 'KXYW',
        practicalTasks: (scenario.practicalTasks ?? []).map((row) => ({
          ...row,
          teacherNotes: 'Pose it early',
        })),
      },
      ...as(author),
    })
    expect(renoted.airport).toBe('KXYW')
    expect(renoted.practicalTasks?.map((row) => row.teacherNotes)).toEqual([
      'Pose it early',
      'Pose it early',
    ])
  })

  it('leaves a course author free to change anything a draft holds', async () => {
    const { course, draft, draftPlan, other, radio } = await publishedEdition()
    const draftOnly = await payload.create({
      collection: 'scenarios',
      depth: 0,
      data: {
        course: course.id,
        name: 'Busy',
        airport: 'KXYZ',
        ...(await scenarioPositions(payload)),
        mode: 'sim',
        practicalTasks: [{ task: radio.id }],
      },
    })

    const added = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: draft.id, code: 'X-TWR-2', theoryItems: [{ task: other.id }] },
      ...as(author),
    })
    const replanned = await payload.update({
      collection: 'lesson-plans',
      id: draftPlan.id,
      data: { minimum: 3, theoryItems: [{ task: other.id }], scenarios: [draftOnly.id] },
      ...as(author),
    })
    expect(replanned).toMatchObject({ minimum: 3, scenarios: [draftOnly.id] })
    const reshaped = await payload.update({
      collection: 'course-versions',
      id: draft.id,
      data: { modules: [{ title: 'Tower', lessonPlans: [added.id, draftPlan.id] }] },
      ...as(author),
    })
    expect(reshaped.modules?.[0].lessonPlans).toEqual([added.id, draftPlan.id])
    const retasked = await payload.update({
      collection: 'scenarios',
      id: draftOnly.id,
      data: { practicalTasks: [{ task: other.id, required: false }] },
      ...as(author),
    })
    expect(retasked.practicalTasks).toMatchObject([{ task: other.id, required: false }])
  })
})
