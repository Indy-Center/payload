import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CourseVersion, LessonPlan, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

/**
 * The course page's actions (decisions 0056, 0057): starting an edition, publishing and
 * discarding a draft. Each is driven through its endpoint as a signed-in user.
 */

let payload: Payload
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
  lead = await account('lead@example.com', '1000009', ['training:lead'])
  author = await account('author@example.com', '1000001')
})

const POINTS = [{ label: 'Not yet' }, { label: 'Meets it' }, { label: 'Beyond it' }]

/** A made-up course, X-TWR, authored by `author`, with no editions. */
function emptyCourse(code = 'X-TWR') {
  return payload.create({
    collection: 'courses',
    data: { code, title: 'Example Tower', authors: [author.cid!] },
  })
}

/** A course whose edition 1 is live: two modules, three lesson plans, one of them unplaced. */
async function liveCourse() {
  const course = await emptyCourse()
  const scale = await payload.create({
    collection: 'grading-scales',
    data: { name: 'Three point', points: POINTS },
  })
  const radio = await payload.create({ collection: 'tasks', data: { name: 'Radio' } })
  const scenario = await payload.create({
    collection: 'scenarios',
    data: {
      course: course.id,
      name: 'Quiet morning',
      airport: 'KXYZ',
      studentPosition: 'XYZ_TWR',
      mode: 'sim',
    },
  })
  const live = await payload.create({
    collection: 'course-versions',
    data: {
      course: course.id,
      number: 1,
      status: 'draft',
      gradingScale: scale.id,
      defaultMinimum: 2,
      completionStandard: 'Pass every lesson plan.',
    },
  })
  const plan = (code: string, data: Partial<LessonPlan> = {}) =>
    payload.create({
      collection: 'lesson-plans',
      depth: 0,
      data: { courseVersion: live.id, code, title: `Plan ${code}`, minimum: 2, ...data },
    })
  const first = await plan('X-TWR-1', { theoryItems: [{ task: radio.id, teacherNotes: 'Ask' }] })
  const second = await plan('X-TWR-2', { scenarios: [scenario.id], time: 60 })
  const spare = await plan('X-TWR-9')
  await payload.update({
    collection: 'course-versions',
    id: live.id,
    data: {
      modules: [
        { title: 'Theory', lessonPlans: [first.id] },
        { title: 'Sim', description: 'In the sim', lessonPlans: [second.id] },
      ],
      status: 'published',
    },
  })
  return { course, scale, radio, scenario, live, first, second, spare }
}

function start(courseId: string, user: User) {
  return callEndpoint(payload, `/courseware/courses/${courseId}/editions`, {
    method: 'post',
    token: null,
    user,
  })
}

async function plansOf(versionId: string): Promise<LessonPlan[]> {
  const { docs } = await payload.find({
    collection: 'lesson-plans',
    where: { courseVersion: { equals: versionId } },
    sort: 'code',
    depth: 0,
    pagination: false,
  })
  return docs
}

describe('starting a new edition', () => {
  it('copies the live edition, its modules and its own lesson plans into a draft numbered next', async () => {
    const { course, scale, radio, scenario, live } = await liveCourse()

    const { status, body } = await start(course.id, lead)

    expect(status).toBe(201)
    const draft: CourseVersion = await payload.findByID({
      collection: 'course-versions',
      id: body.edition.id,
      depth: 0,
    })
    expect(draft).toMatchObject({
      number: 2,
      status: 'draft',
      title: 'X-TWR edition 2',
      gradingScale: scale.id,
      defaultMinimum: 2,
      completionStandard: 'Pass every lesson plan.',
    })

    const copies = await plansOf(draft.id)
    expect(copies.map((plan) => plan.code)).toEqual(['X-TWR-1', 'X-TWR-2', 'X-TWR-9'])
    const originals = await plansOf(live.id)
    expect(copies.map((plan) => plan.id)).not.toContain(originals[0].id)
    expect(copies[0].theoryItems).toMatchObject([{ task: radio.id, teacherNotes: 'Ask' }])
    expect(copies[1]).toMatchObject({ scenarios: [scenario.id], time: 60, minimum: 2 })

    // The modules hold the copies, in the same places.
    expect(draft.modules).toMatchObject([
      { title: 'Theory', lessonPlans: [copies[0].id] },
      { title: 'Sim', description: 'In the sim', lessonPlans: [copies[1].id] },
    ])
    // The live edition is untouched.
    expect(originals).toHaveLength(3)
  })
})

describe('starting a new edition, further', () => {
  it('refuses a second draft: one at a time', async () => {
    const { course } = await liveCourse()
    await start(course.id, lead)

    const { status, body } = await start(course.id, lead)

    expect(status).toBe(400)
    expect(body.errors).toEqual([
      {
        message:
          'X-TWR already has a draft, edition 2. Publish or discard it before starting another.',
      },
    ])
  })

  it('starts an empty edition 1 for a course with no editions', async () => {
    const course = await emptyCourse()

    const { status, body } = await start(course.id, lead)

    expect(status).toBe(201)
    expect(body.edition.number).toBe(1)
    const draft = await payload.findByID({ collection: 'course-versions', id: body.edition.id })
    expect(draft).toMatchObject({ status: 'draft', modules: [] })
    expect(await plansOf(draft.id)).toEqual([])
  })

  it('copies rows as they are: a retired task stays, a parent task is not expanded again', async () => {
    const { course, live, first, radio } = await liveCourse()
    const parent = await payload.create({ collection: 'tasks', data: { name: 'Phraseology' } })
    // The live plan holds the parent alone: its child came later, or its row was removed.
    await payload.update({
      collection: 'lesson-plans',
      id: first.id,
      data: { theoryItems: [{ task: radio.id }, { task: parent.id }] },
    })
    await payload.create({ collection: 'tasks', data: { name: 'Readbacks', parent: parent.id } })
    await payload.update({ collection: 'tasks', id: radio.id, data: { retired: true } })

    const { body } = await start(course.id, lead)

    const [copy] = await plansOf(body.edition.id)
    expect(copy.theoryItems!.map((item) => item.task)).toEqual([radio.id, parent.id])
    expect((await plansOf(live.id))[0].id).toBe(first.id)
  })

  it('copies an empty minimum as empty, not as the edition’s default', async () => {
    const { course, spare } = await liveCourse()
    await payload.update({ collection: 'lesson-plans', id: spare.id, data: { minimum: null } })

    const { body } = await start(course.id, lead)

    const copies = await plansOf(body.edition.id)
    expect(copies.map((plan) => [plan.code, plan.minimum])).toEqual([
      ['X-TWR-1', 2],
      ['X-TWR-2', 2],
      ['X-TWR-9', null],
    ])
  })

  it('lets a course author start a draft of their own course, and edit it fully', async () => {
    const { course, radio } = await liveCourse()

    const { status, body } = await start(course.id, author)

    expect(status).toBe(201)
    const [copy] = await plansOf(body.edition.id)
    const as = { user: author, overrideAccess: false }
    await payload.update({
      collection: 'lesson-plans',
      id: copy.id,
      data: { minimum: 3, theoryItems: [] },
      ...as,
    })
    const added = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: body.edition.id, code: 'X-TWR-3', theoryItems: [{ task: radio.id }] },
      ...as,
    })
    const edited = await payload.update({
      collection: 'course-versions',
      id: body.edition.id,
      data: { modules: [{ title: 'Only module', lessonPlans: [added.id, copy.id] }] },
      depth: 0,
      ...as,
    })

    expect(edited.modules).toMatchObject([{ lessonPlans: [added.id, copy.id] }])
  })

  it('refuses an author of another course', async () => {
    const { course } = await liveCourse()
    const stranger = await account('stranger@example.com', '1000002')

    const { status, body } = await start(course.id, stranger)

    expect(status).toBe(403)
    expect(body.errors).toEqual([{ message: 'You are not allowed to perform this action.' }])
    const { totalDocs } = await payload.count({ collection: 'course-versions' })
    expect(totalDocs).toBe(1)
  })
})

function checkPublishing(versionId: string, user: User) {
  return callEndpoint(payload, `/courseware/course-versions/${versionId}/publishing-check`, {
    token: null,
    user,
  })
}

function publish(versionId: string, user: User) {
  return callEndpoint(payload, `/courseware/course-versions/${versionId}/publish`, {
    method: 'post',
    token: null,
    user,
  })
}

describe('publishing a draft', () => {
  it('makes it live and dates it, for a lead', async () => {
    const { course, live } = await liveCourse()
    const { body: started } = await start(course.id, lead)

    expect((await checkPublishing(started.edition.id, lead)).body).toEqual({ faults: [] })
    const { status } = await publish(started.edition.id, lead)

    expect(status).toBe(200)
    const published = await payload.findByID({
      collection: 'course-versions',
      id: started.edition.id,
    })
    expect(published.status).toBe('published')
    expect(Date.now() - Date.parse(published.publishedAt!)).toBeLessThan(60_000)
    const after = await payload.findByID({ collection: 'courses', id: course.id, depth: 0 })
    expect(after.currentVersion).toBe(started.edition.id)
    // The edition it replaced keeps the date it was published.
    const replaced = await payload.findByID({ collection: 'course-versions', id: live.id })
    expect(replaced.publishedAt).toBeTruthy()
    // A date sent with a save is ignored.
    const resaved = await payload.update({
      collection: 'course-versions',
      id: live.id,
      data: { publishedAt: '2020-01-01T00:00:00.000Z', description: 'Fixed' },
      user: lead,
      overrideAccess: false,
    })
    expect(resaved.publishedAt).toBe(replaced.publishedAt)
  })

  it('lists the existing checks’ reasons, and refuses with them', async () => {
    const course = await emptyCourse()
    const { body: started } = await start(course.id, lead)
    const reasons = [
      'The version names no grading scale.',
      'The version has no lesson plans in its modules.',
    ]

    expect((await checkPublishing(started.edition.id, lead)).body).toEqual({ faults: reasons })
    const { status, body } = await publish(started.edition.id, lead)

    expect(status).toBe(400)
    expect(body.errors.map((error: { message: string }) => error.message)).toEqual(reasons)
  })

  it('is refused to a course author', async () => {
    const { course } = await liveCourse()
    const { body: started } = await start(course.id, author)

    const { status, body } = await publish(started.edition.id, author)

    expect(status).toBe(403)
    expect(body.errors).toEqual([
      { message: 'Only the Training Admin and leads publish an edition.' },
    ])
    const draft = await payload.findByID({ collection: 'course-versions', id: started.edition.id })
    expect(draft.status).toBe('draft')
  })
})

function discard(versionId: string, user: User) {
  return callEndpoint(payload, `/courseware/course-versions/${versionId}/discard`, {
    method: 'post',
    token: null,
    user,
  })
}

describe('discarding a draft', () => {
  it('removes the draft and its own lesson plans, and nothing else', async () => {
    const { course, live } = await liveCourse()
    const { body: started } = await start(course.id, lead)

    const { status, body } = await discard(started.edition.id, lead)

    expect(status).toBe(200)
    expect(body).toEqual({ discarded: { number: 2, lessonPlans: 3 } })
    const editions = await payload.find({ collection: 'course-versions', depth: 0 })
    expect(editions.docs.map((edition) => edition.id)).toEqual([live.id])
    expect(await plansOf(started.edition.id)).toEqual([])
    expect(await plansOf(live.id)).toHaveLength(3)
    // A new edition can be started again, and takes the discarded one's number.
    expect((await start(course.id, lead)).body.edition.number).toBe(2)
  })

  it('refuses a published edition', async () => {
    const { live } = await liveCourse()

    const { status, body } = await discard(live.id, lead)

    expect(status).toBe(400)
    expect(body.errors).toEqual([
      { message: 'Edition 1 is published, so it can’t be discarded. A published edition is kept.' },
    ])
    expect(await plansOf(live.id)).toHaveLength(3)
  })

  it('is refused to a course author', async () => {
    const { course } = await liveCourse()
    const { body: started } = await start(course.id, author)

    const { status, body } = await discard(started.edition.id, author)

    expect(status).toBe(403)
    expect(body.errors).toEqual([{ message: 'Only the Training Admin and leads discard a draft.' }])
    expect(await plansOf(started.edition.id)).toHaveLength(3)
  })
})

describe('editions', () => {
  it('cannot be duplicated: starting a new edition replaces it', async () => {
    const { course, live } = await liveCourse()
    const { body: started } = await start(course.id, lead)

    for (const id of [live.id, started.edition.id]) {
      await expect(
        payload.duplicate({ collection: 'course-versions', id, user: lead, overrideAccess: false }),
      ).rejects.toThrow('The collection with slug course-versions cannot be duplicated.')
    }
    const { totalDocs } = await payload.count({ collection: 'course-versions' })
    expect(totalDocs).toBe(2)
  })
})
