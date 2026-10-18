import { Forbidden, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'
import { resetDatabase, testPayload } from './courseware/helpers'

let payload: Payload
let cmsAdmin: User
let nobody: User

beforeAll(async () => {
  payload = await testPayload()
})

async function account(email: string, roles: User['roles'] = []): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, password: 'example-password', roles },
  })
}

const as = (user: User) => ({ user, overrideAccess: false })

/** The message Payload gives when access is refused. */
async function forbidden(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Forbidden) return error.message
    throw error
  }
  throw new Error('Expected the request to be refused')
}
const NOT_ALLOWED = 'You are not allowed to perform this action.'

beforeEach(async () => {
  await resetDatabase(payload)
  cmsAdmin = await account('cms-admin@example.com', ['cms:admin'])
  nobody = await account('nobody@example.com')
})

describe('the CMS admin', () => {
  it('edits partners and partner categories', async () => {
    const category = await payload.create({
      collection: 'partner-categories',
      data: { name: 'Developers', blurb: 'People who build tools.' },
      ...as(cmsAdmin),
    })
    await payload.create({
      collection: 'partners',
      data: { name: 'Example Tools', category: category.id, status: 'draft' },
      ...as(cmsAdmin),
    })

    const { docs } = await payload.find({ collection: 'partners', ...as(cmsAdmin) })
    expect(docs.map((doc) => doc.name)).toEqual(['Example Tools'])
  })

  it('deletes partners', async () => {
    const category = await payload.create({
      collection: 'partner-categories',
      data: { name: 'Developers', blurb: 'People who build tools.' },
    })
    const partner = await payload.create({
      collection: 'partners',
      data: { name: 'Example Tools', category: category.id, status: 'draft' },
    })

    await payload.delete({ collection: 'partners', id: partner.id, ...as(cmsAdmin) })
    expect(await payload.count({ collection: 'partners' })).toEqual({ totalDocs: 0 })
  })

  it('edits courseware', async () => {
    const task = await payload.create({
      collection: 'tasks',
      data: { name: 'Radio' },
      ...as(cmsAdmin),
    })
    const updated = await payload.update({
      collection: 'tasks',
      id: task.id,
      data: { retired: true },
      ...as(cmsAdmin),
    })
    expect(updated.retired).toBe(true)
  })

  it('edits lesson plans and scenarios, and retires a scenario', async () => {
    const course = await payload.create({
      collection: 'courses',
      data: { code: 'X-TWR', title: 'Example Tower' },
    })
    const draft = await payload.create({
      collection: 'course-versions',
      data: { course: course.id, number: 1, status: 'draft' },
    })
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: { courseVersion: draft.id, title: 'Radio' },
      ...as(cmsAdmin),
    })
    const renamed = await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { title: 'Radio work' },
      ...as(cmsAdmin),
    })
    const scenario = await payload.create({
      collection: 'scenarios',
      data: { course: course.id, name: 'Quiet', airport: 'KXYZ', position: 'XYZ_TWR', mode: 'sim' },
      ...as(cmsAdmin),
    })
    const retired = await payload.update({
      collection: 'scenarios',
      id: scenario.id,
      data: { retired: true },
      ...as(cmsAdmin),
    })

    expect(renamed.title).toBe('Radio work')
    expect(retired.retired).toBe(true)
  })

  it('publishes a course version', async () => {
    const course = await payload.create({
      collection: 'courses',
      data: { code: 'X-TWR', title: 'Example Tower' },
    })
    const draft = await payload.create({
      collection: 'course-versions',
      data: { course: course.id, number: 1, status: 'draft' },
    })
    const scale = await payload.create({
      collection: 'grading-scales',
      data: { name: 'Two point', points: [{ label: 'No' }, { label: 'Yes' }] },
    })
    const task = await payload.create({ collection: 'tasks', data: { name: 'Readbacks' } })
    const plan = await payload.create({
      collection: 'lesson-plans',
      data: {
        courseVersion: draft.id,
        code: 'X-TWR-1',
        title: 'Radio',
        minimum: 2,
        theoryItems: [{ task: task.id }],
      },
    })

    const published = await payload.update({
      collection: 'course-versions',
      id: draft.id,
      data: {
        gradingScale: scale.id,
        defaultMinimum: 2,
        modules: [{ title: 'Tower', lessonPlans: [plan.id] }],
        status: 'published',
      },
      ...as(cmsAdmin),
    })

    expect(published.status).toBe('published')
  })

  it('edits teacher resources', async () => {
    const resources = [{ title: 'Example handbook', url: 'https://example.com/handbook' }]
    await payload.updateGlobal({ slug: 'teacher-resources', data: { resources }, ...as(cmsAdmin) })

    const saved = await payload.findGlobal({ slug: 'teacher-resources', ...as(cmsAdmin) })
    expect(saved.resources?.map((row) => row.title)).toEqual(['Example handbook'])
  })

  it('manages accounts and gives roles', async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: 'new@example.com', password: 'example-password' },
      ...as(cmsAdmin),
    })
    const updated = await payload.update({
      collection: 'users',
      id: created.id,
      data: { cid: '1000003', roles: ['partners:editor'] },
      ...as(cmsAdmin),
    })
    expect(updated.cid).toBe('1000003')
    expect(updated.roles).toEqual(['partners:editor'])

    await payload.delete({ collection: 'users', id: created.id, ...as(cmsAdmin) })
    expect(await payload.count({ collection: 'users' })).toEqual({ totalDocs: 2 })
  })

  it('gives the cms:admin and training:admin roles', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: nobody.id,
      data: { roles: ['cms:admin', 'training:admin'] },
      ...as(cmsAdmin),
    })
    expect(updated.roles).toEqual(['cms:admin', 'training:admin'])
  })
})

describe('roles, once a CMS admin exists', () => {
  it('are no longer open to any signed-in account', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: nobody.id,
      data: { roles: ['cms:admin'] },
      ...as(nobody),
    })
    expect(updated.roles).toEqual([])
  })
})

describe('roles, while no account is the CMS admin', () => {
  beforeEach(async () => {
    await payload.delete({ collection: 'users', id: cmsAdmin.id })
  })

  it('are open to any signed-in account while nobody holds an admin role', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: nobody.id,
      data: { roles: ['cms:admin'] },
      ...as(nobody),
    })
    expect(updated.roles).toEqual(['cms:admin'])
  })

  it('are closed once a Training Admin exists', async () => {
    await account('training-admin@example.com', ['training:admin'])

    const updated = await payload.update({
      collection: 'users',
      id: nobody.id,
      data: { roles: ['cms:admin'] },
      ...as(nobody),
    })
    expect(updated.roles).toEqual([])
  })
})

describe('everyone else', () => {
  it('still can’t reach partners', async () => {
    expect(await forbidden(payload.find({ collection: 'partners', ...as(nobody) }))).toBe(
      NOT_ALLOWED,
    )
  })
})
