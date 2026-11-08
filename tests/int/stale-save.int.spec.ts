import {
  commitTransaction,
  createLocalReq,
  handleEndpoints,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import config from '@/payload.config'
import type { User } from '@/payload-types'
import { refuseStaleSave } from '@/stale-save'
import { resetDatabase, testPayload } from './courseware/helpers'

/**
 * A save made from a copy of a record that has been saved since is refused (courseware 0068): the
 * one shared check, and Payload's edit forms, which send the `updatedAt` they loaded with every
 * save, through the REST API as the admin's form sends a save.
 */

let payload: Payload
let lead: User

const PASSWORD = 'example-password'
const REFUSED = 'Made-up refusal: the record changed.'
const STALE_SAVE =
  'Someone else saved this since you opened it. Reload the page and make your changes again.'

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, roles: User['roles']): Promise<User> {
  return payload.create({ collection: 'users', data: { email, password: PASSWORD, roles } })
}

beforeEach(async () => {
  await resetDatabase(payload)
  lead = await account('lead@example.com', ['training:lead'])
})

/** A made-up task to save. */
const task = () =>
  payload.create({
    collection: 'tasks',
    data: { name: 'Radio', knowledgeStatement: 'Know the words' },
  })

/**
 * One save of the task's name, as a screen makes it: in its own transaction, the check first,
 * from the `updatedAt` the screen loaded. Answers whether it landed.
 */
async function saveName(id: string, updatedAt: unknown, name: string): Promise<boolean> {
  const req = await createLocalReq({ user: { ...lead, collection: 'users' } }, payload)
  await initTransaction(req)
  try {
    await refuseStaleSave(req, { collection: 'tasks', id }, updatedAt, REFUSED)
    await payload.update({ collection: 'tasks', id, data: { name }, req })
    await commitTransaction(req)
    return true
  } catch (error) {
    await killTransaction(req)
    if ((error as { status?: number; message?: string }).status !== 409) throw error
    expect((error as Error).message).toBe(REFUSED)
    return false
  }
}

const nameOf = async (id: string) =>
  (await payload.findByID({ collection: 'tasks', id, depth: 0 })).name

describe('the shared stale-save check', () => {
  it('lets a save from the updatedAt the record has', async () => {
    const radio = await task()

    expect(await saveName(radio.id, radio.updatedAt, 'Radio work')).toBe(true)
    expect(await nameOf(radio.id)).toBe('Radio work')
  })

  it('refuses a save from an older updatedAt, writing nothing', async () => {
    const radio = await task()
    await payload.update({ collection: 'tasks', id: radio.id, data: { name: 'Radio calls' } })

    expect(await saveName(radio.id, radio.updatedAt, 'Radio work')).toBe(false)
    expect(await nameOf(radio.id)).toBe('Radio calls')
  })

  it('refuses a save with no updatedAt, or one that is not a date', async () => {
    const radio = await task()

    expect(await saveName(radio.id, undefined, 'Radio work')).toBe(false)
    expect(await saveName(radio.id, 'yesterday', 'Radio work')).toBe(false)
    expect(await nameOf(radio.id)).toBe('Radio')
  })

  it('lands one of two saves sent together from the same updatedAt, and refuses the other', async () => {
    const radio = await task()

    const landed = await Promise.all([
      saveName(radio.id, radio.updatedAt, 'Radio work'),
      saveName(radio.id, radio.updatedAt, 'Radio calls'),
    ])

    expect(landed.filter(Boolean)).toHaveLength(1)
    expect(await nameOf(radio.id)).toBe(landed[0] ? 'Radio work' : 'Radio calls')
  })
})

/** A signed-in person's REST request, as the admin's edit form sends a save: `_payload`. */
async function formSave(user: User, path: string, data: Record<string, unknown>) {
  const { token } = await payload.login({
    collection: 'users',
    data: { email: user.email, password: PASSWORD },
  })
  const body = new FormData()
  body.set('_payload', JSON.stringify(data))
  const response = await handleEndpoints({
    config,
    request: new Request(`http://localhost:3000/api${path}`, {
      method: path.startsWith('/globals/') ? 'POST' : 'PATCH',
      headers: { Authorization: `JWT ${token}` },
      body,
    }),
  })
  return { status: response.status, body: await response.json() }
}

/** A made-up lesson plan in a draft edition. */
async function lessonPlan() {
  const course = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower' },
  })
  const scale = await payload.create({
    collection: 'grading-scales',
    data: { name: 'Three point', points: [{ label: 'Low' }, { label: 'Mid' }, { label: 'High' }] },
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
  return payload.create({
    collection: 'lesson-plans',
    depth: 0,
    data: { courseVersion: version.id, code: 'X-TWR-1', title: 'Plan one', minimum: 2 },
  })
}

describe("an edit form's save", () => {
  const cases: {
    name: string
    as: () => Promise<User>
    make: () => Promise<{ id: string; updatedAt: string }>
    collection: 'lesson-plans' | 'tasks' | 'partners'
    field: string
  }[] = [
    {
      name: 'a lesson plan',
      as: async () => lead,
      make: lessonPlan,
      collection: 'lesson-plans',
      field: 'title',
    },
    { name: 'a task', as: async () => lead, make: task, collection: 'tasks', field: 'name' },
    {
      name: 'a partner',
      as: () => account('editor@example.com', ['partners:editor']),
      make: async () => {
        const category = await payload.create({
          collection: 'partner-categories',
          data: { name: 'Developers', blurb: 'People who build tools.' },
        })
        return payload.create({
          collection: 'partners',
          data: { name: 'Example Tools', category: category.id, status: 'draft' },
        })
      },
      collection: 'partners',
      field: 'name',
    },
  ]

  const stored = async (
    collection: (typeof cases)[number]['collection'],
    id: string,
    field: string,
  ) =>
    ((await payload.findByID({ collection, id, depth: 0 })) as unknown as Record<string, unknown>)[
      field
    ]

  describe.each(cases)('of $name', ({ as, make, collection, field }) => {
    it('is refused with a stale updatedAt, writing nothing', async () => {
      const user = await as()
      const record = await make()
      await payload.update({ collection, id: record.id, data: { [field]: 'Saved first' } })

      const { status, body } = await formSave(user, `/${collection}/${record.id}`, {
        [field]: 'Saved second',
        updatedAt: record.updatedAt,
      })

      expect(status).toBe(409)
      expect(body.errors).toEqual([expect.objectContaining({ message: STALE_SAVE })])
      expect(await stored(collection, record.id, field)).toBe('Saved first')
    })

    it('lands with the current updatedAt', async () => {
      const user = await as()
      const record = await make()

      const { status } = await formSave(user, `/${collection}/${record.id}`, {
        [field]: 'Saved second',
        updatedAt: record.updatedAt,
      })

      expect(status).toBe(200)
      expect(await stored(collection, record.id, field)).toBe('Saved second')
    })

    it('lands with no updatedAt', async () => {
      const user = await as()
      const record = await make()
      await payload.update({ collection, id: record.id, data: { [field]: 'Saved first' } })

      const { status } = await formSave(user, `/${collection}/${record.id}`, {
        [field]: 'Saved second',
      })

      expect(status).toBe(200)
      expect(await stored(collection, record.id, field)).toBe('Saved second')
    })
  })

  it('is refused as stale before any other rule: here, a lesson plan with no title', async () => {
    const plan = await lessonPlan()
    await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { title: 'Saved first' },
    })

    const { status, body } = await formSave(lead, `/lesson-plans/${plan.id}`, {
      title: '',
      updatedAt: plan.updatedAt,
    })

    expect(status).toBe(409)
    expect(body.errors).toEqual([expect.objectContaining({ message: STALE_SAVE })])
  })

  it('refuses a record the person may not read as such, not as stale', async () => {
    const category = await payload.create({
      collection: 'partner-categories',
      data: { name: 'Developers', blurb: 'People who build tools.' },
    })
    const partner = await payload.create({
      collection: 'partners',
      data: { name: 'Example Tools', category: category.id, status: 'draft' },
    })
    await payload.update({ collection: 'partners', id: partner.id, data: { name: 'Saved first' } })

    // A lead has no access to partners.
    const { status, body } = await formSave(lead, `/partners/${partner.id}`, {
      name: 'Saved second',
      updatedAt: partner.updatedAt,
    })

    expect(status).toBe(403)
    expect(body.errors).toEqual([{ message: 'You are not allowed to perform this action.' }])
  })
})

describe("the Teacher resources form's save", () => {
  const resource = (title: string) => ({ title, url: 'https://example.com/notes' })
  const titles = async () =>
    (await payload.findGlobal({ slug: 'teacher-resources' })).resources?.map((row) => row.title)

  it('is refused with a stale updatedAt, writing nothing', async () => {
    const admin = await account('admin@example.com', ['training:admin'])
    const loaded = await payload.updateGlobal({
      slug: 'teacher-resources',
      data: { resources: [resource('Loaded')] },
    })
    await payload.updateGlobal({
      slug: 'teacher-resources',
      data: { resources: [resource('Saved first')] },
    })

    const { status, body } = await formSave(admin, '/globals/teacher-resources', {
      resources: [resource('Saved second')],
      updatedAt: loaded.updatedAt,
    })

    expect(status).toBe(409)
    expect(body.errors).toEqual([expect.objectContaining({ message: STALE_SAVE })])
    expect(await titles()).toEqual(['Saved first'])
  })

  it('lands with the current updatedAt, or none', async () => {
    const admin = await account('admin@example.com', ['training:admin'])
    const loaded = await payload.updateGlobal({
      slug: 'teacher-resources',
      data: { resources: [resource('Loaded')] },
    })

    const current = await formSave(admin, '/globals/teacher-resources', {
      resources: [resource('Saved second')],
      updatedAt: loaded.updatedAt,
    })
    const none = await formSave(admin, '/globals/teacher-resources', {
      resources: [resource('Saved third')],
    })

    expect([current.status, none.status]).toEqual([200, 200])
    expect(await titles()).toEqual(['Saved third'])
  })
})
