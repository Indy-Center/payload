import { handleEndpoints, type FieldAccess, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import config from '@/payload.config'
import type { CourseVersion, User } from '@/payload-types'
import { callEndpoint, resetDatabase, testPayload } from './helpers'

/**
 * An edition's modules edited from the course page's Content tab: added, renamed, moved and
 * deleted through the Content routes, as a signed-in user, each from the edition's `updatedAt` as
 * the screen loaded it. Deleting a module keeps every lesson plan. In a published edition a
 * course author may reword a module and nothing else (0055).
 */

let payload: Payload
let lead: User
let author: User

const STALE =
  'Someone else changed this outline. The page has been reloaded; make your change again.'
const NOT_ALLOWED = 'You are not allowed to perform this action.'

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
 * Theory (plans 1 and 2), Sim (plan 3) and Empty (none), and plan 9 in no module.
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
  const radio = await payload.create({
    collection: 'tasks',
    data: { name: 'Radio', knowledgeStatement: 'Know the words' },
  })
  const version = await payload.create({
    collection: 'course-versions',
    data: {
      course: course.id,
      number: 1,
      status: 'draft',
      gradingScale: scale.id,
      defaultMinimum: 2,
      completionStandard: 'Finish them all.',
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
        tasks: [{ task: radio.id }],
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
        { title: 'Empty' },
      ],
    },
  })
  const [theory, sim, empty] = placed.modules!.map((module) => module.id!)
  return { course, version: placed, theory, sim, empty, one, two, three, spare }
}

async function stored(versionId: string): Promise<CourseVersion> {
  return payload.findByID({ collection: 'course-versions', id: versionId, depth: 0 })
}

/** The edition's modules as [title, description, lesson plan ids]. */
async function modules(versionId: string) {
  return ((await stored(versionId)).modules ?? []).map((module) => [
    module.title,
    module.description ?? null,
    module.lessonPlans ?? [],
  ])
}

const post = (path: string, user: User, body: Record<string, unknown>) =>
  callEndpoint(payload, `/courseware/course-versions/${path}`, {
    method: 'post',
    token: null,
    body,
    user,
  })

describe('adding a module', () => {
  it('adds it last, with no lesson plans, and answers the edition’s new updatedAt', async () => {
    const { version } = await edition()

    const { status, body } = await post(`${version.id}/modules`, author, {
      updatedAt: version.updatedAt,
      title: '  Radar  ',
      description: 'On the scope',
    })

    expect(status).toBe(201)
    expect((await modules(version.id)).at(-1)).toEqual(['Radar', 'On the scope', []])
    expect(body.updatedAt).toBe((await stored(version.id)).updatedAt)
    expect(body.updatedAt).not.toBe(version.updatedAt)
  })

  it('refuses an empty title with its message, and adds nothing', async () => {
    const { version } = await edition()

    const { status, body } = await post(`${version.id}/modules`, lead, {
      updatedAt: version.updatedAt,
      title: '   ',
      description: '',
    })

    expect(status).toBe(400)
    expect(body.errors).toEqual([{ message: 'A module needs a title.' }])
    expect(await modules(version.id)).toHaveLength(3)
  })
})

describe('renaming a module', () => {
  it('changes its title and description and keeps its lesson plans and id', async () => {
    const { version, theory, one, two } = await edition()

    const { status } = await post(`${version.id}/modules/${theory}`, author, {
      updatedAt: version.updatedAt,
      title: 'Theory first',
      description: '',
    })

    expect(status).toBe(200)
    const after = await stored(version.id)
    expect(after.modules![0]).toMatchObject({
      id: theory,
      title: 'Theory first',
      description: null,
      lessonPlans: [one.id, two.id],
    })
  })

  it('refuses an empty title with its message, and changes nothing', async () => {
    const { version, sim } = await edition()

    const { status, body } = await post(`${version.id}/modules/${sim}`, lead, {
      updatedAt: version.updatedAt,
      title: '',
      description: 'Changed',
    })

    expect(status).toBe(400)
    expect(body.errors).toEqual([{ message: 'A module needs a title.' }])
    expect((await modules(version.id))[1]).toEqual(['Sim', 'In the sim', expect.any(Array)])
  })

  it('refuses a module of another edition', async () => {
    const { course, version } = await edition()
    const other = await payload.create({
      collection: 'course-versions',
      depth: 0,
      data: { course: course.id, number: 2, status: 'draft', modules: [{ title: 'Elsewhere' }] },
    })

    const { status, body } = await post(`${version.id}/modules/${other.modules![0].id}`, lead, {
      updatedAt: version.updatedAt,
      title: 'Moved',
    })

    expect(status).toBe(400)
    expect(body.errors).toEqual([{ message: 'That module is not in X-TWR edition 1.' }])
  })
})

describe('moving a module', () => {
  it('moves it a place up or down, with its lesson plans', async () => {
    const { version, sim, theory } = await edition()

    const up = await post(`${version.id}/modules/${sim}/move`, author, {
      updatedAt: version.updatedAt,
      direction: 'up',
    })
    const down = await post(`${version.id}/modules/${sim}/move`, author, {
      updatedAt: up.body.updatedAt,
      direction: 'down',
    })
    expect([up.status, down.status]).toEqual([200, 200])
    const again = await post(`${version.id}/modules/${theory}/move`, author, {
      updatedAt: down.body.updatedAt,
      direction: 'down',
    })

    expect(again.status).toBe(200)
    expect((await modules(version.id)).map(([title]) => title)).toEqual(['Sim', 'Theory', 'Empty'])
  })

  it('refuses moving the first one up and the last one down', async () => {
    const { version, theory, empty } = await edition()

    const up = await post(`${version.id}/modules/${theory}/move`, lead, {
      updatedAt: version.updatedAt,
      direction: 'up',
    })
    const down = await post(`${version.id}/modules/${empty}/move`, lead, {
      updatedAt: version.updatedAt,
      direction: 'down',
    })

    expect(up.body.errors).toEqual([{ message: 'Theory is already the first module.' }])
    expect(down.body.errors).toEqual([{ message: 'Empty is already the last module.' }])
  })
})

describe('deleting a module', () => {
  it('deletes an empty one', async () => {
    const { version, empty } = await edition()

    const { status } = await post(`${version.id}/modules/${empty}/delete`, author, {
      updatedAt: version.updatedAt,
      lessonPlansTo: null,
    })

    expect(status).toBe(200)
    expect((await modules(version.id)).map(([title]) => title)).toEqual(['Theory', 'Sim'])
  })

  it('puts its lesson plans under Not in a module by default, keeping every record', async () => {
    const { version, theory, one, two, three, spare } = await edition()

    const { status } = await post(`${version.id}/modules/${theory}/delete`, author, {
      updatedAt: version.updatedAt,
    })

    expect(status).toBe(200)
    expect(await modules(version.id)).toEqual([
      ['Sim', 'In the sim', [three.id]],
      ['Empty', null, []],
    ])
    const { docs } = await payload.find({
      collection: 'lesson-plans',
      where: { courseVersion: { equals: version.id } },
      depth: 0,
      sort: 'code',
    })
    expect(docs.map((plan) => plan.id)).toEqual([one.id, two.id, three.id, spare.id])
  })

  it('moves its lesson plans to the end of the module chosen, in their order', async () => {
    const { version, theory, sim, one, two, three } = await edition()

    const { status } = await post(`${version.id}/modules/${theory}/delete`, author, {
      updatedAt: version.updatedAt,
      lessonPlansTo: sim,
    })

    expect(status).toBe(200)
    expect(await modules(version.id)).toEqual([
      ['Sim', 'In the sim', [three.id, one.id, two.id]],
      ['Empty', null, []],
    ])
  })

  it('refuses a module to move them to that isn’t another of this edition’s, and keeps the module', async () => {
    const { version, theory } = await edition()

    const itself = await post(`${version.id}/modules/${theory}/delete`, lead, {
      updatedAt: version.updatedAt,
      lessonPlansTo: theory,
    })

    expect(itself.status).toBe(400)
    expect(itself.body.errors).toEqual([{ message: 'That module is not in X-TWR edition 1.' }])
    expect(await modules(version.id)).toHaveLength(3)
  })
})

describe('a change from an outline someone else has changed since', () => {
  it('is refused with the stale message and changes nothing', async () => {
    const { version, theory, sim, one } = await edition()
    const loaded = version.updatedAt
    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: { completionStandard: 'Changed elsewhere.' },
    })
    const before = await modules(version.id)

    const changes = [
      post(`${version.id}/modules`, lead, { updatedAt: loaded, title: 'New' }),
      post(`${version.id}/modules/${theory}`, lead, { updatedAt: loaded, title: 'Renamed' }),
      post(`${version.id}/modules/${sim}/move`, lead, { updatedAt: loaded, direction: 'up' }),
      post(`${version.id}/modules/${theory}/delete`, lead, { updatedAt: loaded }),
      callEndpoint(payload, `/courseware/lesson-plans/${one.id}/move`, {
        method: 'post',
        token: null,
        body: { updatedAt: loaded, direction: 'down' },
        user: lead,
      }),
      callEndpoint(payload, `/courseware/lesson-plans/${one.id}/module`, {
        method: 'post',
        token: null,
        body: { updatedAt: loaded, module: null },
        user: lead,
      }),
    ]
    for (const change of changes) {
      const { status, body } = await change
      expect(status).toBe(409)
      expect(body.errors).toEqual([{ message: STALE }])
    }
    expect(await modules(version.id)).toEqual(before)
  })

  it('is refused when it sends no updatedAt', async () => {
    const { version, sim } = await edition()

    const { status, body } = await post(`${version.id}/modules/${sim}/move`, lead, {
      direction: 'up',
    })

    expect(status).toBe(409)
    expect(body.errors).toEqual([{ message: STALE }])
  })

  it('lands one of two moves sent together from the same updatedAt, and refuses the other', async () => {
    const { version, sim, empty } = await edition()

    const answers = await Promise.all([
      post(`${version.id}/modules/${sim}/move`, lead, {
        updatedAt: version.updatedAt,
        direction: 'up',
      }),
      post(`${version.id}/modules/${empty}/move`, lead, {
        updatedAt: version.updatedAt,
        direction: 'up',
      }),
    ])

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409])
    expect(answers.find((answer) => answer.status === 409)!.body.errors).toEqual([
      { message: STALE },
    ])
    const titles = (await modules(version.id)).map(([title]) => title)
    expect([
      ['Sim', 'Theory', 'Empty'],
      ['Theory', 'Empty', 'Sim'],
    ]).toContainEqual(titles)
  })
})

describe('a course author in a published edition', () => {
  it('saves a module’s title and description', async () => {
    const { version, sim, three } = await edition('published')

    const { status } = await post(`${version.id}/modules/${sim}`, author, {
      updatedAt: version.updatedAt,
      title: 'In the simulator',
      description: 'Reworded',
    })

    expect(status).toBe(200)
    expect((await modules(version.id))[1]).toEqual(['In the simulator', 'Reworded', [three.id]])
  })

  it('is refused adding, moving and deleting a module, with the edition’s access message', async () => {
    const { version, sim, empty } = await edition('published')
    const before = await modules(version.id)

    for (const [path, body] of [
      [`${version.id}/modules`, { title: 'More' }],
      [`${version.id}/modules/${sim}/move`, { direction: 'up' }],
      [`${version.id}/modules/${empty}/delete`, {}],
      [`${version.id}/modules/${sim}/delete`, { lessonPlansTo: empty }],
    ] as const) {
      const answer = await post(path, author, { updatedAt: version.updatedAt, ...body })
      expect(answer).toEqual({ status: 403, body: { errors: [{ message: NOT_ALLOWED }] } })
    }
    expect(await modules(version.id)).toEqual(before)
  })

  it('may reword the edition’s description and completion standard', async () => {
    const { version } = await edition('published')

    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: { description: 'Reworded' },
      user: author,
      overrideAccess: false,
    })
    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: { completionStandard: 'Reworded by the author' },
      user: author,
      overrideAccess: false,
    })

    expect(await stored(version.id)).toMatchObject({
      description: 'Reworded',
      completionStandard: 'Reworded by the author',
      defaultMinimum: 2,
    })
  })

  it('saves the drawer’s form with a changed description from the current updatedAt', async () => {
    const { version } = await edition('published')
    const { token } = await payload.login({
      collection: 'users',
      data: { email: author.email, password: 'example-password' },
    })
    const body = new FormData()
    body.set(
      '_payload',
      JSON.stringify({ description: 'Reworded', defaultMinimum: 2, updatedAt: version.updatedAt }),
    )

    const response = await handleEndpoints({
      config,
      request: new Request(`http://localhost:3000/api/course-versions/${version.id}`, {
        method: 'PATCH',
        headers: { Authorization: `JWT ${token}` },
        body,
      }),
    })

    expect(response.status).toBe(200)
    expect((await stored(version.id)).description).toBe('Reworded')

    // The same save again, from the updatedAt it opened with: someone saved since.
    const again = new FormData()
    again.set(
      '_payload',
      JSON.stringify({
        description: 'Reworded twice',
        defaultMinimum: 2,
        updatedAt: version.updatedAt,
      }),
    )
    const refused = await handleEndpoints({
      config,
      request: new Request(`http://localhost:3000/api/course-versions/${version.id}`, {
        method: 'PATCH',
        headers: { Authorization: `JWT ${token}` },
        body: again,
      }),
    })

    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({
      errors: [
        {
          message:
            'Someone else saved this since you opened it. Reload the page and make your changes again.',
        },
      ],
    })
    expect((await stored(version.id)).description).toBe('Reworded')
  })

  it('is refused a change to the edition’s time, grading scale and default minimum', async () => {
    const { version } = await edition('published')
    const other = await payload.create({
      collection: 'grading-scales',
      data: { name: 'Two point', points: [{ label: 'No' }, { label: 'Yes' }] },
    })

    for (const data of [{ time: 5 }, { defaultMinimum: 3 }, { gradingScale: other.id }]) {
      await expect(
        payload.update({
          collection: 'course-versions',
          id: version.id,
          data,
          user: author,
          overrideAccess: false,
        }),
      ).rejects.toThrow(NOT_ALLOWED)
    }
    // The form as loaded, saved without a change: an empty description sent for none.
    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: { completionStandard: 'Finish them all.', description: '', defaultMinimum: 2 },
      user: author,
      overrideAccess: false,
    })

    expect(await stored(version.id)).toMatchObject({
      completionStandard: 'Finish them all.',
      defaultMinimum: 2,
    })
  })

  it('is refused a lesson plan row change with the existing structure message', async () => {
    const { one } = await edition('published')
    const other = await payload.create({
      collection: 'tasks',
      data: { name: 'Other', knowledgeStatement: 'Know more' },
    })

    await expect(
      payload.update({
        collection: 'lesson-plans',
        id: one.id,
        data: { tasks: [...(one.tasks ?? []), { task: other.id }] },
        user: author,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({
      data: {
        errors: [
          {
            message:
              'This lesson plan is in a published edition, so changing its tasks, their order, whether each is required, its minimum, the scenarios it offers or its edition is a structural change, which needs the Training Admin or a lead. Its wording and teacher notes can still change.',
          },
        ],
      },
    })
  })

  it('lets a lead add, move and delete modules in a published edition', async () => {
    const { version, sim, empty } = await edition('published')

    const added = await post(`${version.id}/modules`, lead, {
      updatedAt: version.updatedAt,
      title: 'Radar',
    })
    const moved = await post(`${version.id}/modules/${sim}/move`, lead, {
      updatedAt: added.body.updatedAt,
      direction: 'up',
    })
    const deleted = await post(`${version.id}/modules/${empty}/delete`, lead, {
      updatedAt: moved.body.updatedAt,
    })

    expect([added.status, moved.status, deleted.status]).toEqual([201, 200, 200])
    expect((await modules(version.id)).map(([title]) => title)).toEqual(['Sim', 'Theory', 'Radar'])
  })
})

describe('in a draft, a course author', () => {
  it('adds, moves and deletes modules', async () => {
    const { version, sim, empty } = await edition()

    const added = await post(`${version.id}/modules`, author, {
      updatedAt: version.updatedAt,
      title: 'Radar',
    })
    const moved = await post(`${version.id}/modules/${sim}/move`, author, {
      updatedAt: added.body.updatedAt,
      direction: 'up',
    })
    const deleted = await post(`${version.id}/modules/${empty}/delete`, author, {
      updatedAt: moved.body.updatedAt,
    })

    expect([added.status, moved.status, deleted.status]).toEqual([201, 200, 200])
    expect((await modules(version.id)).map(([title]) => title)).toEqual(['Sim', 'Theory', 'Radar'])
  })
})

describe('“Edit grading and completion”', () => {
  it('leaves the edition’s modules as they are when its form is saved', async () => {
    const { version } = await edition()
    const before = await modules(version.id)
    const form = payload.collections['course-versions'].config.fields.find(
      (field) => 'name' in field && field.name === 'modules',
    )
    // The form doesn't show the modules, so a save of it sends none.
    expect((form?.admin as { disabled?: boolean } | undefined)?.disabled).toBe(true)

    await payload.update({
      collection: 'course-versions',
      id: version.id,
      data: {
        description: 'Reworded',
        time: 900,
        completionStandard: 'Finish every lesson plan.',
        gradingScale: version.gradingScale,
        defaultMinimum: 3,
      },
      user: author,
      overrideAccess: false,
    })

    expect(await modules(version.id)).toEqual(before)
    expect(await stored(version.id)).toMatchObject({
      completionStandard: 'Finish every lesson plan.',
    })
  })
})

describe('the edition’s fields’ update access', () => {
  /** Whether `user` may update each of the edition's own fields on an edition in `status`. */
  const updatable = (user: User, status: 'draft' | 'published') => {
    const fields = payload.collections['course-versions'].config.fields
    return Object.fromEntries(
      ['description', 'completionStandard', 'time', 'gradingScale', 'defaultMinimum'].map(
        (name) => {
          const field = fields.find((f) => 'name' in f && f.name === name)
          const access = (field as { access?: { update?: FieldAccess } }).access?.update
          return [name, access ? access({ req: { user }, doc: { status } } as never) : true]
        },
      ),
    )
  }

  it('leaves a course author only the description and completion standard once published', () => {
    expect(updatable(author, 'published')).toEqual({
      description: true,
      completionStandard: true,
      time: false,
      gradingScale: false,
      defaultMinimum: false,
    })
  })

  it('leaves a course author every field in a draft, and a lead every field', () => {
    expect(Object.values(updatable(author, 'draft'))).toEqual([true, true, true, true, true])
    expect(Object.values(updatable(lead, 'published'))).toEqual([true, true, true, true, true])
  })
})
