import { createLocalReq, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadEditions, loadOutline } from '@/components/admin/courses/editions'
import { mayChangeOutline } from '@/courseware/outline'
import type { CourseVersion, LessonPlan, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

/**
 * Lesson plans edited from their module on the course page (ticket 21, decisions 0023 and 0055):
 * adding one to a module, moving it between modules and up or down, and taking it out of the
 * outline, as a signed-in user. The outline lives on the edition's `modules[].lessonPlans`; the
 * lesson plan stays its own record.
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

/**
 * A made-up course, X-TWR, authored by `author`, with an edition in the given status: modules
 * Theory (plans 1 and 2) and Sim (plan 3), and plan 9 in no module.
 */
async function edition(status: 'draft' | 'published' = 'draft') {
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', authors: [author.cid!] },
  })
  const scale = await payload.create({
    collection: 'grading-scales',
    data: { name: 'Three point', points: [{ label: 'Low' }, { label: 'Mid' }, { label: 'High' }] },
  })
  const radio = await payload.create({ collection: 'tasks', data: { name: 'Radio' } })
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
  const plan = (code: string) =>
    payload.create({
      collection: 'lesson-plans',
      depth: 0,
      data: {
        courseVersion: version.id,
        code,
        title: `Plan ${code}`,
        minimum: 2,
        theoryItems: [{ task: radio.id }],
      },
    })
  const [one, two, three, spare] = [
    await plan('X-TWR-1'),
    await plan('X-TWR-2'),
    await plan('X-TWR-3'),
    await plan('X-TWR-9'),
  ]
  const placed = await payload.update({
    collection: 'course-versions',
    id: version.id,
    depth: 0,
    data: {
      status,
      modules: [
        { title: 'Theory', lessonPlans: [one.id, two.id] },
        { title: 'Sim', description: 'In the sim', lessonPlans: [three.id] },
      ],
    },
  })
  const [theory, sim] = placed.modules!.map((module) => module.id!)
  return { course, version: placed, theory, sim, one, two, three, spare }
}

/** The edition's modules as [title, lesson plan ids]. */
async function outline(versionId: string) {
  const version: CourseVersion = await payload.findByID({
    collection: 'course-versions',
    id: versionId,
    depth: 0,
  })
  return (version.modules ?? []).map((module) => [module.title, module.lessonPlans ?? []])
}

const asUser = (user: User) => ({ user, overrideAccess: false, depth: 0 }) as const

function place(planId: string, module: string | null, user: User) {
  return callEndpoint(payload, `/courseware/lesson-plans/${planId}/module`, {
    method: 'post',
    token: null,
    body: { module },
    user,
  })
}

function move(planId: string, direction: string, user: User) {
  return callEndpoint(payload, `/courseware/lesson-plans/${planId}/move`, {
    method: 'post',
    token: null,
    body: { direction },
    user,
  })
}

async function refusal(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise
  } catch (error) {
    const data = (error as { data?: { errors?: { message: string }[] } }).data
    if (data?.errors) return data.errors.map((each) => each.message)
    return [(error as Error).message]
  }
  throw new Error('Expected a refusal')
}

describe('adding a lesson plan from a module', () => {
  it('ties it to the edition and places it last in that module, with the edition’s default minimum', async () => {
    const { version, sim, three } = await edition()

    const added: LessonPlan = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: version.id, module: sim, code: 'X-TWR-4', title: 'New plan' },
      ...asUser(author),
    })

    expect(added).toMatchObject({ courseVersion: version.id, minimum: 2 })
    expect(await outline(version.id)).toEqual([
      ['Theory', expect.any(Array)],
      ['Sim', [three.id, added.id]],
    ])
  })

  it('is refused to a course author in a published edition, with the structural message', async () => {
    const { version, sim } = await edition('published')

    const messages = await refusal(
      payload.create({
        collection: 'lesson-plans',
        data: { courseVersion: version.id, module: sim, code: 'X-TWR-4' },
        ...asUser(author),
      }),
    )

    expect(messages).toEqual([
      'This edition is published, so adding a lesson plan to it is a structural change, which needs the Training Admin or a lead.',
    ])
    const { totalDocs } = await payload.count({
      collection: 'lesson-plans',
      where: { code: { equals: 'X-TWR-4' } },
    })
    expect(totalDocs).toBe(0)
  })

  it('lets a lead add one to a published edition', async () => {
    const { version, theory, one, two } = await edition('published')

    const added = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: version.id, module: theory, code: 'X-TWR-4' },
      ...asUser(lead),
    })

    expect((await outline(version.id))[0]).toEqual(['Theory', [one.id, two.id, added.id]])
  })
})

describe('the Module field on a lesson plan', () => {
  it('moves the plan to the end of the chosen module, and keeps the record', async () => {
    const { version, sim, one, two, three } = await edition()

    const saved = await payload.update({
      collection: 'lesson-plans',
      id: one.id,
      data: { module: sim, title: 'Reworded' },
      ...asUser(author),
    })

    expect(saved).toMatchObject({ id: one.id, title: 'Reworded', courseVersion: version.id })
    expect(await outline(version.id)).toEqual([
      ['Theory', [two.id]],
      ['Sim', [three.id, one.id]],
    ])
  })

  it('takes the plan out of the outline when it names no module, and keeps the record', async () => {
    const { version, one, two, three } = await edition()

    await payload.update({
      collection: 'lesson-plans',
      id: two.id,
      data: { module: '' },
      ...asUser(author),
    })

    expect(await outline(version.id)).toEqual([
      ['Theory', [one.id]],
      ['Sim', [three.id]],
    ])
    const kept = await payload.findByID({ collection: 'lesson-plans', id: two.id, depth: 0 })
    expect(kept).toMatchObject({ code: 'X-TWR-2', courseVersion: version.id })
  })

  it('leaves the outline alone when it is not sent, or names the module the plan is in', async () => {
    const { version, theory, one, two, three } = await edition('published')

    await payload.update({
      collection: 'lesson-plans',
      id: two.id,
      data: { title: 'Reworded' },
      ...asUser(author),
    })
    await payload.update({
      collection: 'lesson-plans',
      id: one.id,
      data: { title: 'Reworded too', module: theory },
      ...asUser(author),
    })

    expect(await outline(version.id)).toEqual([
      ['Theory', [one.id, two.id]],
      ['Sim', [three.id]],
    ])
  })

  it('is refused to a course author in a published edition, and the plan is not saved', async () => {
    const { version, sim, one } = await edition('published')

    const messages = await refusal(
      payload.update({
        collection: 'lesson-plans',
        id: one.id,
        data: { module: sim, title: 'Reworded' },
        ...asUser(author),
      }),
    )

    expect(messages).toEqual(['You are not allowed to perform this action.'])
    const plan = await payload.findByID({ collection: 'lesson-plans', id: one.id })
    expect(plan.title).toBe('Plan X-TWR-1')
    expect((await outline(version.id))[0][1]).toContain(one.id)
  })
})

describe('moving a lesson plan up and down', () => {
  it('swaps it with its neighbour in the module', async () => {
    const { version, one, two } = await edition()

    const { status } = await move(two.id, 'up', author)

    expect(status).toBe(200)
    expect((await outline(version.id))[0]).toEqual(['Theory', [two.id, one.id]])
  })

  it('refuses moving the first one up and the last one down', async () => {
    const { one, two } = await edition()

    const up = await move(one.id, 'up', lead)
    const down = await move(two.id, 'down', lead)

    expect(up).toEqual({
      status: 400,
      body: { errors: [{ message: 'X-TWR-1 is already first in Theory.' }] },
    })
    expect(down.body.errors).toEqual([{ message: 'X-TWR-2 is already last in Theory.' }])
  })

  it('refuses a plan in no module', async () => {
    const { spare } = await edition()

    const { status, body } = await move(spare.id, 'down', lead)

    expect(status).toBe(400)
    expect(body.errors).toEqual([{ message: 'X-TWR-9 is not in a module.' }])
  })

  it('is refused to a course author in a published edition, and allowed to a lead', async () => {
    const { version, one, two } = await edition('published')

    const refused = await move(two.id, 'up', author)
    const allowed = await move(two.id, 'up', lead)

    expect(refused).toEqual({
      status: 403,
      body: { errors: [{ message: 'You are not allowed to perform this action.' }] },
    })
    expect(allowed.status).toBe(200)
    expect((await outline(version.id))[0]).toEqual(['Theory', [two.id, one.id]])
  })
})

describe('taking a lesson plan out of its module and putting it back', () => {
  it('removes it from the outline and keeps the record', async () => {
    const { version, one, two, three } = await edition()

    const { status } = await place(one.id, null, author)

    expect(status).toBe(200)
    expect(await outline(version.id)).toEqual([
      ['Theory', [two.id]],
      ['Sim', [three.id]],
    ])
    const kept = await payload.findByID({ collection: 'lesson-plans', id: one.id, depth: 0 })
    expect(kept).toMatchObject({ code: 'X-TWR-1', courseVersion: version.id })
  })

  it('puts a plan in no module back, last in the module chosen', async () => {
    const { version, theory, one, two, spare } = await edition()

    const { status } = await place(spare.id, theory, author)

    expect(status).toBe(200)
    expect((await outline(version.id))[0]).toEqual(['Theory', [one.id, two.id, spare.id]])
  })

  it('refuses a module of another edition of the same course', async () => {
    const { course, version, one, two, three } = await edition('published')
    const other = await payload.create({
      collection: 'course-versions',
      depth: 0,
      data: { course: course.id, number: 2, status: 'draft', modules: [{ title: 'Elsewhere' }] },
    })
    const elsewhere = other.modules![0].id!

    const { status, body } = await place(one.id, elsewhere, lead)

    expect(status).toBe(400)
    expect(body.errors).toEqual([{ message: 'That module is not in X-TWR edition 1.' }])
    expect(await outline(version.id)).toEqual([
      ['Theory', [one.id, two.id]],
      ['Sim', [three.id]],
    ])
    expect(await outline(other.id)).toEqual([['Elsewhere', []]])
  })

  it('writes only the modules’ lesson plans: module ids, descriptions and the edition’s fields stay', async () => {
    const { version, theory, sim, one, two, three } = await edition()
    expect(version.gradingScale).toEqual(expect.any(String))

    expect((await move(two.id, 'up', author)).status).toBe(200)
    expect((await place(three.id, theory, author)).status).toBe(200)

    const after: CourseVersion = await payload.findByID({
      collection: 'course-versions',
      id: version.id,
      depth: 0,
    })
    expect(after).toMatchObject({
      status: 'draft',
      gradingScale: version.gradingScale,
      defaultMinimum: 2,
    })
    expect(
      after.modules!.map(({ id, title, description }) => ({ id, title, description })),
    ).toEqual([
      { id: theory, title: 'Theory', description: null },
      { id: sim, title: 'Sim', description: 'In the sim' },
    ])
    expect(after.modules!.map((module) => module.lessonPlans)).toEqual([
      [two.id, one.id, three.id],
      [],
    ])
  })

  it('is refused to a course author in a published edition', async () => {
    const { version, one, two, three } = await edition('published')

    const { status, body } = await place(one.id, null, author)

    expect(status).toBe(403)
    expect(body.errors).toEqual([{ message: 'You are not allowed to perform this action.' }])
    expect(await outline(version.id)).toEqual([
      ['Theory', [one.id, two.id]],
      ['Sim', [three.id]],
    ])
  })
})

describe('who may change an edition’s outline, as the course page asks', () => {
  const asked = async (user: User, id: string) =>
    mayChangeOutline(await createLocalReq({ user: { ...user, collection: 'users' } }, payload), id)

  it('is the course author in a draft', async () => {
    const { version } = await edition()

    expect(await asked(author, version.id)).toBe(true)
  })

  it('is a lead in a published edition, and not its course author', async () => {
    const { version } = await edition('published')

    expect(await asked(lead, version.id)).toBe(true)
    expect(await asked(author, version.id)).toBe(false)
  })
})

describe('the outline the Content tab lists', () => {
  it('lists each module’s plans in order with minutes and theory items, and the plans in no module', async () => {
    const { version, one } = await edition()
    await payload.update({ collection: 'lesson-plans', id: one.id, data: { time: 90 } })
    const req = await createLocalReq({ user: { ...author, collection: 'users' } }, payload)

    const outlined = await loadOutline(req, version.id)

    expect(outlined.modules.map((module) => [module.title, module.lessonPlans])).toEqual([
      [
        'Theory',
        [
          { id: one.id, code: 'X-TWR-1', title: 'Plan X-TWR-1', minutes: 90, theoryItems: 1 },
          expect.objectContaining({ code: 'X-TWR-2', minutes: null }),
        ],
      ],
      ['Sim', [expect.objectContaining({ code: 'X-TWR-3' })]],
    ])
    expect(outlined.unplaced.map((plan) => plan.code)).toEqual(['X-TWR-9'])
    expect(outlined.ownLessonPlans).toBe(4)
  })

  it('is read as the person signed in, so no one signed out sees it', async () => {
    const { version } = await edition()
    const signedOut = await createLocalReq({}, payload)

    await expect(loadOutline(signedOut, version.id)).rejects.toThrow('You are not allowed')
  })
})

describe('the editions the course page lists', () => {
  it('sorts a course’s editions into live, draft and replaced, counting plans in modules', async () => {
    const { course } = await edition()
    const req = await createLocalReq({ user: { ...author, collection: 'users' } }, payload)

    const editions = await loadEditions(req, course)

    expect(editions).toEqual({
      live: null,
      draft: expect.objectContaining({ number: 1, publishedAt: null, lessonPlans: 3 }),
      replaced: [],
    })
  })

  it('is read as the person signed in, so no one signed out sees them', async () => {
    const { course } = await edition()
    const signedOut = await createLocalReq({}, payload)

    await expect(loadEditions(signedOut, course)).rejects.toThrow('You are not allowed')
  })
})
